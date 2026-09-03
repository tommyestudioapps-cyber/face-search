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