import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';
import { FaceRecognitionError } from '../../faceSearch/types.ts';

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
  const found = moduleLoadMocks.find(({ requestPart }) => (
    request.includes(requestPart)
  ));
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
const mediaLibrary = {
  accessPrivileges: 'all',
  assetReads: 0,
  invalidCursor: null,
  async getPermissionsAsync() {
    return {
      granted: this.accessPrivileges !== 'none',
      accessPrivileges: this.accessPrivileges,
    };
  },
  async getAssetsAsync(options = {}) {
    if (options.after === this.invalidCursor) {
      throw new Error('The saved gallery cursor is no longer valid.');
    }
    this.assetReads += 1;
    return {
      assets: [{
        id: 'kept-after-limited-access',
        uri: 'file:///photos/kept.jpg',
        filename: 'kept.jpg',
        creationTime: 1,
        modificationTime: 2,
        width: 1200,
        height: 800,
      }],
      endCursor: this.assetReads === 1 ? 'cursor-after-kept' : null,
      hasNextPage: this.assetReads === 1,
      totalCount: 1,
    };
  },
};

mock.module('@react-native-async-storage/async-storage', {
  cache: true,
  defaultExport: storageMock,
});

const databaseDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'background-index-integration-'),
);
const databasePath = path.join(databaseDirectory, 'face-search.sqlite');
const database = new DatabaseSync(databasePath);

function parameters(values = []) {
  return Array.isArray(values) ? values : [values];
}

const databaseAdapter = {
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
      await callback(databaseAdapter);
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

const { FaceSearchRepository, getModelStorageVersion } = await import(
  '../../faceSearch/repository.ts'
);
const repository = new FaceSearchRepository({
  platformOS: 'android',
  openDatabase: async () => databaseAdapter,
});

const galleryPermissionMock = {
  hasFullGalleryPhotoPermission: async () => {
    const permission = await mediaLibrary.getPermissionsAsync();
    return permission.granted && permission.accessPrivileges === 'all';
  },
};
registerModuleLoadMock('galleryPermission', galleryPermissionMock);
mock.module(new URL('../galleryPermission.ts', import.meta.url), {
  cache: true,
  namedExports: galleryPermissionMock,
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

const model = {
  name: 'MobileFaceNet',
  version: 'mobilefacenet-192-v1',
  input: { width: 112, height: 112, channels: 3 },
  embeddingDimension: 192,
  pixelNormalization: { mean: 128, stddev: 128 },
};

function createPhoto(assetId) {
  return {
    assetId,
    uri: `file:///photos/${assetId}.jpg`,
    filename: `${assetId}.jpg`,
    creationTime: 1,
    modificationTime: 2,
    width: 1200,
    height: 800,
    modelVersion: model.version,
    indexedAt: 1,
    faceCount: 0,
  };
}

const galleryIndexerMock = {
  indexGallery: async ({ batch }) => {
    const permission = await mediaLibrary.getPermissionsAsync();
    if (!permission.granted || permission.accessPrivileges !== 'all') {
      return {
        status: 'cancelled',
        processedAssets: 0,
        totalAssets: 1,
        indexedPhotos: 0,
        skippedAssets: 0,
        indexedFaces: 0,
        removedPhotos: 0,
      };
    }

    if (batch.after === 'stale-cursor') {
      try {
        await mediaLibrary.getAssetsAsync({ after: batch.after });
      } catch (cause) {
        throw new FaceRecognitionError(
          'invalid-cursor',
          'Não foi possível retomar a página da galeria.',
          cause,
        );
      }
    }

    const page = await mediaLibrary.getAssetsAsync();
    if (batch.generation === 1) {
      await repository.saveIndexedPhoto(
        createPhoto(page.assets[0].id),
        [],
      );
      mediaLibrary.accessPrivileges = 'limited';
      await batch.onCheckpoint(page.endCursor);
      return {
        status: 'cancelled',
        processedAssets: 1,
        totalAssets: 1,
        indexedPhotos: 1,
        skippedAssets: 0,
        indexedFaces: 0,
        removedPhotos: 0,
      };
    }

    await repository.markAssetSeen(page.assets[0].id, batch.generation);
    const removedPhotos = await repository.completeScan(batch.generation);
    return {
      status: 'completed',
      processedAssets: 1,
      totalAssets: 1,
      indexedPhotos: 0,
      skippedAssets: 0,
      indexedFaces: 0,
      removedPhotos,
    };
  },
};
registerModuleLoadMock('galleryIndexer', galleryIndexerMock);
mock.module(new URL('../../faceSearch/galleryIndexer.ts', import.meta.url), {
  cache: true,
  namedExports: galleryIndexerMock,
});

const { runBackgroundIndexBatch } = await import('../batchRunner.ts');
const { loadBackgroundIndexCursor } = await import('../checkpoint.ts');

test.after(async () => {
  await repository.close();
  await rm(databaseDirectory, { recursive: true, force: true });
});

test('interrompe ao perder acesso integral e só remove órfãs no ciclo seguinte completo', async () => {
  await repository.saveIndexedPhoto(createPhoto('deleted-from-gallery'), []);

  let completeScanCalls = 0;
  const originalCompleteScan = repository.completeScan.bind(repository);
  repository.completeScan = async (generation) => {
    completeScanCalls += 1;
    return originalCompleteScan(generation);
  };

  try {
    await runBackgroundIndexBatch();

    assert.deepEqual(
      (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
      ['deleted-from-gallery', 'kept-after-limited-access'],
    );
    assert.equal(await loadBackgroundIndexCursor(), undefined);
    assert.equal(completeScanCalls, 0);
    assert.equal(await repository.getActiveScanGeneration(), 1);

    mediaLibrary.accessPrivileges = 'limited';
    await runBackgroundIndexBatch();
    assert.equal(mediaLibrary.assetReads, 1);
    assert.equal(completeScanCalls, 0);

    mediaLibrary.accessPrivileges = 'all';
    await runBackgroundIndexBatch();

    assert.equal(mediaLibrary.assetReads, 2);
    assert.equal(completeScanCalls, 1);
    assert.equal(await repository.getActiveScanGeneration(), null);
    assert.deepEqual(
      (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
      ['kept-after-limited-access'],
    );
  } finally {
    repository.completeScan = originalCompleteScan;
  }
});

test('cursor inválido é limpo sem perder resultados e permite uma nova geração segura', async () => {
  await repository.saveIndexedPhoto(createPhoto('deleted-before-restart'), []);
  const interruptedGeneration = await repository.beginScan();
  const { saveBackgroundIndexCursor } = await import('../checkpoint.ts');
  await saveBackgroundIndexCursor('stale-cursor', interruptedGeneration);
  mediaLibrary.invalidCursor = 'stale-cursor';

  try {
    await assert.rejects(
      runBackgroundIndexBatch(),
      (error) => error instanceof FaceRecognitionError &&
        error.code === 'invalid-cursor',
    );
  } finally {
    mediaLibrary.invalidCursor = null;
  }

  assert.equal(await loadBackgroundIndexCursor(), undefined);
  assert.deepEqual(
    (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
    ['deleted-before-restart', 'kept-after-limited-access'],
  );
  assert.equal(await repository.getActiveScanGeneration(), interruptedGeneration);

  await runBackgroundIndexBatch();

  assert.equal(await repository.getActiveScanGeneration(), null);
  assert.deepEqual(
    (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
    ['kept-after-limited-access'],
  );
});