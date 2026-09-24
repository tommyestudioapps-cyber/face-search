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

test('reproduz geração órfã travada após a lease expirar', async () => {
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

    // Simula SIGKILL/OOM: não libera, aborta nem conclui a geração; a referência
    // da execução interrompida é descartada, mas a geração fica registrada.
    // O repositório não expõe o relógio nem um helper para avançá-lo, então a
    // própria conexão SQLite da instância expira a lease diretamente. Usar 0
    // torna a expiração determinística sem mockar Date.now().
    await database.runAsync(
      'UPDATE gallery_scan SET lease_until = ? WHERE id = 1',
      [0],
    );

    const activeGenerationAfterExpiry = await repository.getActiveScanGeneration();
    console.log('getActiveScanGeneration() após expirar lease:', activeGenerationAfterExpiry);

    let firstBeginGeneration = null;
    let firstBeginError = null;
    try {
      firstBeginGeneration = await repository.beginScan('owner-B');
    } catch (error) {
      firstBeginError = {
        name: error?.name,
        code: error?.code,
        message: error?.message,
      };
    }
    console.log('primeiro beginScan(owner-B):', {
      generation: firstBeginGeneration,
      error: firstBeginError,
    });

    const aborted = await repository.abortScanIfUnleased(genA);
    console.log('abortScanIfUnleased(genA):', aborted);

    let secondBeginGeneration = null;
    let secondBeginError = null;
    try {
      secondBeginGeneration = await repository.beginScan('owner-B');
    } catch (error) {
      secondBeginError = {
        name: error?.name,
        code: error?.code,
        message: error?.message,
      };
    }
    console.log('segundo beginScan(owner-B):', {
      generation: secondBeginGeneration,
      error: secondBeginError,
    });

    assert.equal(activeGenerationAfterExpiry, genA);
    assert.equal(aborted, true);
    assert.equal(secondBeginError, null);
    assert.equal(typeof secondBeginGeneration, 'number');

    // Falha intencional: a hipótese reproduzida é que a lease expirada não
    // libera beginScan por si só; a recuperação só ocorre após o abort explícito.
    assert.equal(
      firstBeginError,
      null,
      'beginScan(owner-B) deveria funcionar automaticamente após a lease expirar',
    );
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});