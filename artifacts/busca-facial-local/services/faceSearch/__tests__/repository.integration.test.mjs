import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

const model = {
  name: 'MobileFaceNet',
  version: 'mobilefacenet-192-v1',
  input: {
    width: 112,
    height: 112,
    channels: 3,
  },
  embeddingDimension: 192,
  pixelNormalization: {
    mean: 128,
    stddev: 128,
  },
};

function createPhoto(assetId) {
  return {
    assetId,
    uri: `file:///photos/${assetId}.jpg`,
    filename: `${assetId}.jpg`,
    creationTime: 1_700_000_000,
    modificationTime: 1_700_000_001,
    width: 1200,
    height: 800,
    modelVersion: 'mobilefacenet-192-v1:192:112x112x3',
    indexedAt: 1_700_000_001,
    faceCount: 1,
  };
}

function createFace(assetId, faceIndex = 0, value = 1) {
  return {
    id: `${assetId}:${faceIndex}`,
    assetId,
    faceIndex,
    boundingBox: {
      x: 0.2,
      y: 0.2,
      width: 0.4,
      height: 0.4,
      coordinateSpace: 'normalized',
    },
    embedding: {
      values: new Float32Array(192).fill(value),
      model,
      normalized: true,
    },
    modelVersion: 'mobilefacenet-192-v1:192:112x112x3',
    indexedAt: 1_700_000_001,
  };
}

test('limpa o índice, reabre o mesmo SQLite e preserva a galeria', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-search-'));
  const databasePath = path.join(directory, 'face-search.sqlite');
  let openCount = 0;

  const repository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => {
      openCount += 1;
      return createNativeSQLiteAdapter(databasePath);
    },
  });

  try {
    await repository.initialize();
    await repository.saveIndexedPhoto(
      createPhoto('photo-before-cleanup'),
      [createFace('photo-before-cleanup')],
    );

    assert.deepEqual(await repository.getStoredIndexStats(), {
      indexedPhotos: 1,
      indexedFaces: 1,
    });

    await repository.clearIndex();

    assert.deepEqual(await repository.getStoredIndexStats(), {
      indexedPhotos: 0,
      indexedFaces: 0,
    });
    const repositorySource = await readFile(
      new URL('../repository.ts', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(repositorySource, /expo-media-library/);
    assert.doesNotMatch(repositorySource, /deleteAssetsAsync/);

    await repository.close();
    await repository.initialize();
    assert.equal(openCount, 2);

    await repository.saveIndexedPhoto(
      createPhoto('photo-after-reopen'),
      [createFace('photo-after-reopen', 0, 0.5)],
    );

    assert.deepEqual(await repository.getStoredIndexStats(), {
      indexedPhotos: 1,
      indexedFaces: 1,
    });
    assert.deepEqual(await repository.getIndexedEmbeddings(), [
      {
        photo: createPhoto('photo-after-reopen'),
        face: createFace('photo-after-reopen', 0, 0.5),
      },
    ]);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('lotes parciais não excluem resultados; ao concluir, apenas fotos não vistas e seus rostos somem', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-scan-'));
  const databasePath = path.join(directory, 'index.sqlite');
  const repository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => createNativeSQLiteAdapter(databasePath),
  });
  try {
    await repository.saveIndexedPhoto(createPhoto('unchanged'), [createFace('unchanged')]);
    await repository.saveIndexedPhoto(createPhoto('deleted'), [createFace('deleted')]);
    await repository.saveIndexedPhoto(createPhoto('no-face'), []);

    const first = await repository.beginScan();
    await repository.markAssetSeen('unchanged', first);
    await repository.close(); // simula interrupção entre lotes
    assert.equal(await repository.getActiveScanGeneration(), first);
    assert.deepEqual((await repository.getIndexedPhotos()).map((p) => p.assetId), ['deleted', 'no-face', 'unchanged']);

    // Cursor inválido: recomeçar uma nova geração impede que marcas antigas contem.
    await repository.abortScan(first);
    const restarted = await repository.beginScan();
    assert.notEqual(restarted, first);
    await assert.rejects(repository.completeScan(first), /geração da varredura/);
    await repository.markAssetSeen('unchanged', restarted);
    await repository.markAssetSeen('no-face', restarted);
    assert.deepEqual(await repository.getStoredIndexStats(), { indexedPhotos: 3, indexedFaces: 2 });
    assert.equal(await repository.completeScan(restarted), 1);
    assert.deepEqual(await repository.getStoredIndexStats(), { indexedPhotos: 2, indexedFaces: 1 });
    assert.deepEqual((await repository.getIndexedPhotos()).map((p) => p.assetId), ['no-face', 'unchanged']);
    assert.equal(await repository.getActiveScanGeneration(), null);
    await assert.rejects(repository.completeScan(restarted), /geração da varredura/);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('uma varredura interrompida antes de qualquer foto mantém todo o índice', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-scan-empty-'));
  const repository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => createNativeSQLiteAdapter(path.join(directory, 'index.sqlite')),
  });
  try {
    await repository.saveIndexedPhoto(createPhoto('keep'), [createFace('keep')]);
    const interrupted = await repository.beginScan();
    await repository.close();
    assert.deepEqual(await repository.getStoredIndexStats(), { indexedPhotos: 1, indexedFaces: 1 });
    await repository.abortScan(interrupted);
    const newScan = await repository.beginScan();
    await repository.markAssetSeen('keep', newScan);
    assert.equal(await repository.completeScan(newScan), 0);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('cancelar uma indexação manual libera a próxima sem apagar resultados', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-scan-cancel-'));
  const repository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => createNativeSQLiteAdapter(path.join(directory, 'index.sqlite')),
  });

  try {
    await repository.saveIndexedPhoto(createPhoto('saved-result'), [createFace('saved-result')]);
    const cancelledGeneration = await repository.beginScan();
    await repository.abortScan(cancelledGeneration);

    assert.equal(await repository.getActiveScanGeneration(), null);
    assert.deepEqual(await repository.getStoredIndexStats(), {
      indexedPhotos: 1,
      indexedFaces: 1,
    });

    const nextGeneration = await repository.beginScan();
    await repository.markAssetSeen('saved-result', nextGeneration);
    assert.equal(await repository.completeScan(nextGeneration), 0);
    assert.deepEqual(await repository.getStoredIndexStats(), {
      indexedPhotos: 1,
      indexedFaces: 1,
    });
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('duas conexões não iniciam gerações concorrentes nem alteram a primeira', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-scan-concurrent-'));
  const databasePath = path.join(directory, 'index.sqlite');
  const firstRepository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => createNativeSQLiteAdapter(databasePath),
  });
  const secondRepository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => createNativeSQLiteAdapter(databasePath),
  });

  try {
    const firstGeneration = await firstRepository.beginScan();
    await assert.rejects(
      secondRepository.beginScan(),
      /Já existe uma varredura da galeria em andamento/,
    );
    assert.equal(await firstRepository.getActiveScanGeneration(), firstGeneration);
    assert.equal(await secondRepository.getActiveScanGeneration(), firstGeneration);
    await firstRepository.completeScan(firstGeneration);
    assert.equal(await secondRepository.getActiveScanGeneration(), null);
  } finally {
    await firstRepository.close();
    await secondRepository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migra um índice antigo sem perder as fotos e só remove órfãs após ciclo completo', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'face-scan-migration-'));
  const databasePath = path.join(directory, 'index.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    PRAGMA user_version = 1;
    CREATE TABLE indexed_photos (
      id_media_library TEXT PRIMARY KEY NOT NULL,
      uri_local TEXT NOT NULL, file_name TEXT, created_at INTEGER,
      updated_at INTEGER, dimensions TEXT NOT NULL,
      indexing_status TEXT NOT NULL, model_version TEXT NOT NULL
    );
    CREATE TABLE face_embeddings (
      id TEXT PRIMARY KEY NOT NULL, photo_id TEXT NOT NULL,
      face_index INTEGER NOT NULL, bounding_box_json TEXT NOT NULL,
      embedding_blob BLOB NOT NULL, model_version TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (photo_id) REFERENCES indexed_photos (id_media_library) ON DELETE CASCADE,
      UNIQUE (photo_id, face_index)
    );
    INSERT INTO indexed_photos VALUES (
      'old', 'file:///photos/old.jpg', 'old.jpg', 1, 2,
      '{"width":1200,"height":800}', 'indexed', 'model'
    );
  `);
  legacy.close();
  const repository = new FaceSearchRepository({
    platformOS: 'android',
    openDatabase: async () => createNativeSQLiteAdapter(databasePath),
  });
  try {
    assert.equal((await repository.getIndexedPhotos()).length, 1);
    const generation = await repository.beginScan();
    assert.equal((await repository.getIndexedPhotos()).length, 1);
    assert.equal(await repository.completeScan(generation), 1);
    assert.deepEqual(await repository.getIndexedPhotos(), []);
  } finally {
    await repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});