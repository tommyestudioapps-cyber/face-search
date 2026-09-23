import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { mock } from 'node:test';
import { FaceRecognitionError } from '../../faceSearch/types.ts';
import { IndexCoordinator } from '../indexCoordinatorPolicy.ts';

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
    mediaLibrary.lastBatchAfter = batch.after ?? null;
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
    if (mediaLibrary.pauseForManualSearch) {
      await repository.saveIndexedPhoto(createPhoto(page.assets[0].id), [], batch.generation, batch.leaseOwner);
      await batch.onCheckpoint('cursor-for-manual-search');
      mediaLibrary.signalCheckpoint();
      await mediaLibrary.waitForSearch;
      if (batch.shouldYield()) {
        return {
          status: 'paused',
          processedAssets: 1,
          totalAssets: 2,
          indexedPhotos: 1,
          skippedAssets: 0,
          indexedFaces: 0,
          removedPhotos: 0,
        };
      }
      throw new Error('A busca manual não recebeu prioridade.');
    }
    if (mediaLibrary.crashAfterCheckpoint) {
      await repository.saveIndexedPhoto(
        createPhoto(page.assets[0].id),
        [],
        batch.generation,
        batch.leaseOwner,
      );
      await batch.onCheckpoint('cursor-before-process-restart');
      throw new Error('simulated abrupt process termination');
    }
    if (batch.generation === 1) {
      await repository.saveIndexedPhoto(
        createPhoto(page.assets[0].id),
        [],
        batch.generation,
        batch.leaseOwner,
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

    await repository.markAssetSeen(page.assets[0].id, batch.generation, batch.leaseOwner);
    const removedPhotos = await repository.completeScan(batch.generation, batch.leaseOwner);
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
const { indexCoordinator, getLastIndexOperationStatus } = await import('../indexCoordinator.ts');

test.after(async () => {
  await repository.close();
  await rm(databaseDirectory, { recursive: true, force: true });
});

test('interrompe ao perder acesso integral e só remove órfãs no ciclo seguinte completo', async () => {
  await repository.saveIndexedPhoto(createPhoto('deleted-from-gallery'), []);

  let completeScanCalls = 0;
  const originalCompleteScan = repository.completeScan.bind(repository);
  repository.completeScan = async (generation, owner) => {
    completeScanCalls += 1;
    return originalCompleteScan(generation, owner);
  };

  try {
    await runBackgroundIndexBatch();

    assert.deepEqual(
      (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
      ['deleted-from-gallery', 'kept-after-limited-access'],
    );
    assert.equal(await loadBackgroundIndexCursor(), undefined);
    assert.equal(completeScanCalls, 0);
    assert.equal(await repository.getActiveScanGeneration(), null);

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
  assert.equal(await repository.getActiveScanGeneration(), null);

  await runBackgroundIndexBatch();

  assert.equal(await repository.getActiveScanGeneration(), null);
  assert.deepEqual(
    (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
    ['kept-after-limited-access'],
  );
});

test('retoma após encerramento entre checkpoint e conclusão sem apagar resultados', async () => {
  await repository.saveIndexedPhoto(createPhoto('deleted-before-process-restart'), []);
  mediaLibrary.crashAfterCheckpoint = true;

  await assert.rejects(
    runBackgroundIndexBatch(),
    /simulated abrupt process termination/,
  );

  mediaLibrary.crashAfterCheckpoint = false;
  const savedCheckpoint = await loadBackgroundIndexCursor();
  assert.deepEqual(savedCheckpoint?.cursor, 'cursor-before-process-restart');
  assert.equal(await repository.getActiveScanGeneration(), savedCheckpoint?.generation);
  assert.deepEqual(
    (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
    ['deleted-before-process-restart', 'kept-after-limited-access'],
  );

  await repository.close();
  await runBackgroundIndexBatch();

  assert.equal(mediaLibrary.lastBatchAfter, 'cursor-before-process-restart');
  assert.equal(await loadBackgroundIndexCursor(), undefined);
  assert.equal(await repository.getActiveScanGeneration(), null);
  assert.deepEqual(
    (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
    ['kept-after-limited-access'],
  );
});

test('reinicia geração abandonada antes do primeiro checkpoint sem remover fotos prematuramente', async () => {
  await repository.saveIndexedPhoto(createPhoto('keep-before-first-checkpoint'), []);
  const interrupted = await repository.beginScan();
  assert.equal(await repository.getActiveScanGeneration(), interrupted);
  assert.equal(await loadBackgroundIndexCursor(), undefined);
  await runBackgroundIndexBatch();
  assert.equal(await repository.getActiveScanGeneration(), null);
  assert.equal(await loadBackgroundIndexCursor(), undefined);
  assert.deepEqual(
    (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
    ['kept-after-limited-access'],
  );
});

test('lote não aborta uma geração manual ativa sem checkpoint', async () => {
  const generation = await repository.beginScan('foreground');
  try {
    await runBackgroundIndexBatch();
    assert.equal(await repository.getActiveScanGeneration(), generation);
    assert.equal(await repository.claimScan(generation, 'background'), false);
  } finally {
    await repository.abortScan(generation, 'foreground');
  }
});

test('lote pausa no checkpoint para uma busca e retoma sem limpar resultados', async () => {
  await repository.saveIndexedPhoto(createPhoto('keep-until-complete'), []);
  let signalCheckpoint;
  const checkpointSaved = new Promise((resolve) => { signalCheckpoint = resolve; });
  let releaseSearch;
  mediaLibrary.waitForSearch = new Promise((resolve) => { releaseSearch = resolve; });
  mediaLibrary.signalCheckpoint = signalCheckpoint;
  mediaLibrary.pauseForManualSearch = true;

  try {
    const firstBatch = runBackgroundIndexBatch();
    await checkpointSaved;
    const order = [];
    const search = indexCoordinator.run('search', async () => {
      order.push('search');
      assert.deepEqual(
        (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
        ['keep-until-complete', 'kept-after-limited-access'],
      );
    });
    releaseSearch();
    await Promise.all([firstBatch, search]);
    assert.deepEqual(order, ['search']);
    const checkpoint = await loadBackgroundIndexCursor();
    assert.equal(checkpoint?.cursor, 'cursor-for-manual-search');
    assert.equal(checkpoint?.generation, await repository.getActiveScanGeneration());
    assert.equal((await getLastIndexOperationStatus())?.operation, 'search');
    assert.equal((await repository.getIndexedPhotos()).length, 2);

    mediaLibrary.pauseForManualSearch = false;
    await runBackgroundIndexBatch();
    assert.equal(mediaLibrary.lastBatchAfter, 'cursor-for-manual-search');
    assert.equal(await loadBackgroundIndexCursor(), undefined);
    assert.equal(await repository.getActiveScanGeneration(), null);
    assert.deepEqual(
      (await repository.getIndexedPhotos()).map((photo) => photo.assetId),
      ['kept-after-limited-access'],
    );
  } finally {
    mediaLibrary.pauseForManualSearch = false;
    releaseSearch();
  }
});

test('busca manual espera um lote e precede o próximo, sem descartar o checkpoint', async () => {
  const statuses = [];
  const coordinator = new IndexCoordinator(async (status) => {
    statuses.push(status);
  });
  let releasePage;
  const page = new Promise((resolve) => { releasePage = resolve; });
  let pageStarted;
  const started = new Promise((resolve) => { pageStarted = resolve; });
  const order = [];

  const firstBatch = coordinator.run('background', async () => {
    order.push('first page');
    pageStarted();
    await page;
    assert.equal(coordinator.shouldYieldBackground(), true);
    order.push('checkpoint preserved; paused');
  });
  await started;
  const secondBatch = coordinator.run('background', async () => {
    order.push('second batch');
  });
  const search = coordinator.run('search', async () => {
    order.push('manual search');
  });
  assert.deepEqual(order, ['first page']);
  releasePage();
  await Promise.all([firstBatch, secondBatch, search]);
  await coordinator.waitForStatusPersistence();
  assert.deepEqual(order, [
    'first page',
    'checkpoint preserved; paused',
    'manual search',
    'second batch',
  ]);
  assert.deepEqual(statuses.map(({ operation, state }) => `${operation}:${state}`), [
    'background:running', 'background:finished',
    'search:running', 'search:finished',
    'background:running', 'background:finished',
  ]);
});

test('falha de operação libera a fila e salva o último estado', async () => {
  const statuses = [];
  const coordinator = new IndexCoordinator(async (status) => {
    statuses.push(status);
  });
  await assert.rejects(
    coordinator.run('background', async () => { throw new Error('falha do lote'); }),
    /falha do lote/,
  );
  assert.equal(coordinator.getLastStatus()?.state, 'failed');
  await coordinator.run('search', async () => undefined);
  await coordinator.waitForStatusPersistence();
  assert.equal(coordinator.getLastStatus()?.operation, 'search');
  assert.equal(coordinator.getLastStatus()?.state, 'finished');
  assert.equal(statuses.length, 4);
});

test('falha ao salvar estado não bloqueia a busca nem a próxima operação', async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => { warnings.push(args); };
  try {
    const coordinator = new IndexCoordinator(async () => {
      throw new Error('storage unavailable');
    });
    const executed = [];
    await coordinator.run('search', async () => { executed.push('search'); });
    await coordinator.run('background', async () => { executed.push('background'); });
    await coordinator.waitForStatusPersistence();
    assert.deepEqual(executed, ['search', 'background']);
    assert.equal(coordinator.getLastStatus()?.state, 'finished');
    assert.equal(warnings.length, 4);
  } finally {
    console.warn = originalWarn;
  }
});

test('liberação de recursos espera a indexação terminar', async () => {
  const coordinator = new IndexCoordinator(async () => undefined);
  let releaseBatch;
  const pending = new Promise((resolve) => { releaseBatch = resolve; });
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const events = [];
  const batch = coordinator.run('background', async () => {
    events.push('batch started');
    started();
    await pending;
    events.push('batch ended');
  });
  await ready;
  const disposal = coordinator.run('dispose', async () => {
    events.push('resources released');
  });
  assert.deepEqual(events, ['batch started']);
  releaseBatch();
  await Promise.all([batch, disposal]);
  assert.deepEqual(events, ['batch started', 'batch ended', 'resources released']);
});