// Reprodução do C3a: persistBackgroundState engole erro de escrita e deixa o estado preso em 'running'. Este teste descreve o comportamento atual; a correção do C3a deve ser acompanhada da atualização deste teste.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';

globalThis.__DEV__ = false;

const storedValues = new Map([
  ['visage.background-index.consent', 'accepted'],
]);
const localRequire = createRequire(import.meta.url);
const moduleApi = localRequire('node:module');
const moduleLoadMocks = [];
const originalModuleLoad = moduleApi._load;

function registerModuleLoadMock(requestPart, exports) {
  moduleLoadMocks.push({ requestPart, exports });
}

moduleApi._load = function loadWithTestMocks(request, parent, isMain) {
  const found = moduleLoadMocks.find(({ requestPart }) => request.includes(requestPart));
  if (found) return found.exports;
  return originalModuleLoad.call(this, request, parent, isMain);
};

const storageMock = {
  getItem: async (key) => storedValues.get(key) ?? null,
  setItem: async (key, value) => {
    storedValues.set(key, value);
  },
  removeItem: async (key) => {
    storedValues.delete(key);
  },
};

registerModuleLoadMock('@react-native-async-storage/async-storage', storageMock);
mock.module('@react-native-async-storage/async-storage', {
  cache: true,
  defaultExport: storageMock,
});

const databaseDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'background-index-c3a-'),
);
const databasePath = path.join(databaseDirectory, 'face-search.sqlite');

function parameters(values = []) {
  return Array.isArray(values) ? values : [values];
}

function createDatabaseAdapter() {
  const database = new DatabaseSync(databasePath);
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

const { FaceSearchRepository, getModelStorageVersion } = await import(
  '../../faceSearch/repository.ts'
);
const repository = new FaceSearchRepository({
  platformOS: 'android',
  openDatabase: async () => createDatabaseAdapter(),
});

const galleryPermissionMock = {
  hasFullGalleryPhotoPermission: async () => true,
};
registerModuleLoadMock('galleryPermission', galleryPermissionMock);
mock.module(new URL('../galleryPermission.ts', import.meta.url), {
  cache: true,
  namedExports: galleryPermissionMock,
});

const galleryIndexerMock = {
  indexGallery: async () => ({
    status: 'completed',
    processedAssets: 0,
    totalAssets: 0,
    lastAssetId: null,
    indexedPhotos: 0,
    skippedAssets: 0,
    indexedFaces: 0,
    removedPhotos: 0,
  }),
};
registerModuleLoadMock('galleryIndexer', galleryIndexerMock);
mock.module(new URL('../../faceSearch/galleryIndexer.ts', import.meta.url), {
  cache: true,
  namedExports: galleryIndexerMock,
});

mock.module(new URL('../../faceSearch/repository.ts', import.meta.url), {
  cache: true,
  namedExports: {
    faceSearchRepository: repository,
    getModelStorageVersion,
  },
});
registerModuleLoadMock('repository', {
  faceSearchRepository: repository,
  getModelStorageVersion,
});

const { runBackgroundIndexBatch } = await import('../batchRunner.ts');

test.after(async () => {
  await repository.close();
  await rm(databaseDirectory, { recursive: true, force: true });
  moduleApi._load = originalModuleLoad;
});

test('mantém running quando a persistência do estado terminal falha silenciosamente', async () => {
  await repository.initialize();
  await repository.updateBackgroundIndexState({ status: 'running' });

  const originalUpdate = repository.updateBackgroundIndexState.bind(repository);
  repository.updateBackgroundIndexState = async (patch) => {
    if (patch.status !== 'running') {
      throw new Error('simulated storage failure');
    }
    return originalUpdate(patch);
  };

  await runBackgroundIndexBatch();

  const persistedState = await repository.getBackgroundIndexState();
  assert.equal(persistedState.status, 'running');
});