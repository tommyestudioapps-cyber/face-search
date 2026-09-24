import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FaceSearchRepository } from '../repository.ts';

function createNativeSQLiteAdapter(databasePath) {
  const database = new DatabaseSync(databasePath);

  function parameters(values = []) {
    return Array.isArray(values) ? values : [values];
  }

  const adapter = {
    async execAsync(source) {
      database.exec(source);
    },

    async getFirstAsync(source, values = []) {
      return database.prepare(source).get(...parameters(values)) ?? null;
    },

    async getAllAsync(source, values = []) {
      return database.prepare(source).all(...parameters(values));
    },

    async runAsync(source, values = []) {
      const result = database.prepare(source).run(...parameters(values));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },

    async withExclusiveTransactionAsync(callback) {
      database.exec('BEGIN IMMEDIATE');
      try {
        await callback(adapter);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },

    async closeAsync() {
      database.close();
    },
  };

  return adapter;
}

test('recupera apenas leases expiradas e preserva varreduras protegidas', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-scan-orphan-'));
  const databasePath = path.join(directory, 'index.sqlite');
  let database;
  const repository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => {
      database = createNativeSQLiteAdapter(databasePath);
      return database;
    },
  });

  try {
    const genA = await repository.beginScan('owner-A');

    // Simula SIGKILL/OOM sem liberar, abortar ou concluir a geração. Como o
    // repositório não expõe um helper para avançar o relógio, a própria
    // conexão SQLite expira a lease diretamente com um valor determinístico.
    await database.runAsync(
      'UPDATE gallery_scan SET lease_until = ? WHERE id = 1',
      [0],
    );

    const genB = await repository.beginScan('owner-B');
    assert.equal(typeof genB, 'number');
    assert.notEqual(genB, genA);
    assert.equal(await repository.getActiveScanGeneration(), genB);
    assert.equal(await repository.abortScanIfUnleased(genA), false);

    await repository.abortScan(genB, 'owner-B');
    const genC = await repository.beginScan();
    await assert.rejects(
      repository.beginScan('owner-D'),
      (error) => error?.code === 'indexing-failed' &&
        error?.message === 'Já existe uma varredura da galeria em andamento.',
    );

    await repository.abortScan(genC);
    await repository.beginScan('owner-E');
    await assert.rejects(
      repository.beginScan('owner-F'),
      (error) => error?.code === 'indexing-failed' &&
        error?.message === 'Já existe uma varredura da galeria em andamento.',
    );
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});