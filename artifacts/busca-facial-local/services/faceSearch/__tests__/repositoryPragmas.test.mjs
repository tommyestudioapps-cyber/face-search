// Regressão para o fix de database is locked: garante que journal_mode=WAL,
// busy_timeout=10000 e SCAN_LEASE_MS=300_000 permaneçam configurados.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FaceSearchRepository, SCAN_LEASE_MS } from '../repository.ts';

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

test('mantém os PRAGMAs do banco e a duração da lease configurados', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-scan-pragmas-'));
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
    await repository.initialize();

    const busyTimeout = await database.getFirstAsync(
      'SELECT * FROM pragma_busy_timeout();',
    );
    // node:sqlite exposes the pragma's busy timeout column as `timeout`.
    assert.equal(busyTimeout.timeout, 10000);

    const journalMode = await database.getFirstAsync(
      'SELECT * FROM pragma_journal_mode();',
    );
    assert.equal(journalMode.journal_mode, 'wal');

    assert.equal(SCAN_LEASE_MS, 60_000);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});