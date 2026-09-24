import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FaceSearchRepository } from '../../faceSearch/repository.ts';
import { reconcileOrphanRunningState } from '../reconcileOrphanRunning.ts';

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

const fixtures = [];

async function createRepositoryFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-index-reconcile-'));
  const databasePath = path.join(directory, 'index.sqlite');
  let database;
  const repository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => {
      database = createNativeSQLiteAdapter(databasePath);
      return database;
    },
  });
  fixtures.push({ directory, repository });
  return {
    database: () => database,
    repository,
  };
}

test.after(async () => {
  await Promise.all(
    fixtures.map(async ({ directory, repository }) => {
      await repository.close();
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

test('pausa running órfão com geração ativa e lease expirada', async () => {
  const { database, repository } = await createRepositoryFixture();
  await repository.beginScan('owner-A');
  await repository.updateBackgroundIndexState({ status: 'running' });
  await database().runAsync('UPDATE gallery_scan SET lease_until = 0 WHERE id = 1');

  await reconcileOrphanRunningState(repository);

  assert.equal((await repository.getBackgroundIndexState()).status, 'paused');
  assert.equal(await repository.getActiveScanGeneration(), null);
});

test('pausa running sem geração ativa', async () => {
  const { repository } = await createRepositoryFixture();
  await repository.updateBackgroundIndexState({ status: 'running' });

  await reconcileOrphanRunningState(repository);

  assert.equal((await repository.getBackgroundIndexState()).status, 'paused');
});

test('preserva running com lease válida', async () => {
  const { repository } = await createRepositoryFixture();
  await repository.beginScan('owner-A');
  await repository.updateBackgroundIndexState({ status: 'running' });

  await reconcileOrphanRunningState(repository);

  assert.equal((await repository.getBackgroundIndexState()).status, 'running');
  assert.notEqual(await repository.getActiveScanGeneration(), null);
});

test('não toca em estado terminal', async () => {
  const { repository } = await createRepositoryFixture();
  await repository.updateBackgroundIndexState({ status: 'completed' });

  await reconcileOrphanRunningState(repository);

  assert.equal((await repository.getBackgroundIndexState()).status, 'completed');
});