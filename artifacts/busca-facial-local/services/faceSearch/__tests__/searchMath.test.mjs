import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifySimilarity,
  cosineSimilarity,
  groupBestResults,
  normalizeL2,
} from '../searchMath.ts';

const thresholds = {
  approved: 0.82,
  review: 0.7,
  rejected: 0.7,
};

const boundingBox = {
  x: 0.2,
  y: 0.2,
  width: 0.4,
  height: 0.4,
  coordinateSpace: 'normalized',
};

function candidate(assetId, faceIndex, values) {
  return {
    photo: {
      assetId,
      uri: `file:///photos/${assetId}.jpg`,
      filename: `${assetId}.jpg`,
      creationTime: 1,
    },
    face: {
      id: `${assetId}:${faceIndex}`,
      faceIndex,
      boundingBox,
      embedding: { values: new Float32Array(values) },
    },
  };
}

test('calcula similaridade de cosseno entre vetores float', () => {
  assert.ok(Math.abs(cosineSimilarity(
    new Float32Array([1, 0]),
    new Float32Array([1, 0]),
  ) - 1) < 0.000001);
  assert.ok(Math.abs(cosineSimilarity(
    new Float32Array([1, 0]),
    new Float32Array([0, 1]),
  )) < 0.000001);
  assert.ok(Math.abs(cosineSimilarity(
    new Float32Array([1, 2]),
    new Float32Array([2, 1]),
  ) - 0.8) < 0.000001);
});

test('normaliza embeddings pela norma L2', () => {
  const normalized = normalizeL2(new Float32Array([3, 4]));
  assert.ok(Math.abs(normalized[0] - 0.6) < 0.000001);
  assert.ok(Math.abs(normalized[1] - 0.8) < 0.000001);
  const norm = Math.hypot(...normalized);
  assert.ok(Math.abs(norm - 1) < 0.000001);
  assert.throws(() => normalizeL2(new Float32Array([0, 0])));
});

test('classifica os três níveis de limiar', () => {
  assert.equal(classifySimilarity(0.95, thresholds), 'approved');
  assert.equal(classifySimilarity(0.8, thresholds), 'review');
  assert.equal(classifySimilarity(0.69, thresholds), 'rejected');
});

test('agrupa rostos por foto, usa o maior score e ordena', () => {
  const results = groupBestResults(
    [
      candidate('photo-a', 0, [0.8, 0.6]),
      candidate('photo-a', 1, [1, 0]),
      candidate('photo-b', 0, [0.75, Math.sqrt(1 - 0.75 ** 2)]),
      candidate('photo-c', 0, [0.6, 0.8]),
    ],
    new Float32Array([1, 0]),
    thresholds,
    50,
  );

  assert.equal(results.length, 2);
  assert.equal(results[0].assetId, 'photo-a');
  assert.equal(results[0].faceIndex, 1);
  assert.equal(results[0].similarity, 1);
  assert.equal(results[0].classification, 'approved');
  assert.equal(results[1].assetId, 'photo-b');
  assert.equal(results[1].classification, 'review');
  assert.ok(results[0].similarity > results[1].similarity);
});

test('limita resultados e retorna vazio sem correspondências sintéticas', () => {
  const results = groupBestResults(
    [
      candidate('photo-a', 0, [1, 0]),
      candidate('photo-b', 0, [0.8, 0.6]),
    ],
    new Float32Array([1, 0]),
    thresholds,
    1,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].assetId, 'photo-a');

  const empty = groupBestResults(
    [candidate('photo-rejected', 0, [0, 1])],
    new Float32Array([1, 0]),
    thresholds,
    50,
  );
  assert.deepEqual(empty, []);
});