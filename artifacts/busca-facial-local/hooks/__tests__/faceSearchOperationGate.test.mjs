import assert from 'node:assert/strict';
import test from 'node:test';

import { FaceSearchOperationGate } from '../faceSearchOperationGate.ts';

test('aguarda a operação ativa antes de limpar e preserva o resultado da busca', async () => {
  const gate = new FaceSearchOperationGate();
  let resolveSearch;
  let clearCalls = 0;
  const searchResult = { results: [{ assetId: 'photo-1' }] };
  const searchStarted = new Promise((resolve) => {
    resolveSearch = resolve;
  });

  const search = gate.run(async () => {
    await searchStarted;
    return searchResult;
  });

  const clear = gate.clear(async () => {
    clearCalls += 1;
  });

  await Promise.resolve();
  assert.equal(clearCalls, 0);

  resolveSearch();
  assert.deepEqual(await search, searchResult);
  await clear;
  assert.equal(clearCalls, 1);
});

test('aguarda a limpeza antes de iniciar uma nova indexação', async () => {
  const gate = new FaceSearchOperationGate();
  let releaseClear;
  let indexingStarted = false;
  const clearReleased = new Promise((resolve) => {
    releaseClear = resolve;
  });

  const clear = gate.clear(async () => {
    await clearReleased;
  });
  const indexing = gate.run(async () => {
    indexingStarted = true;
    return 'index-complete';
  });

  await Promise.resolve();
  assert.equal(indexingStarted, false);

  releaseClear();
  assert.equal(await indexing, 'index-complete');
  await clear;
  assert.equal(indexingStarted, true);
});

test('não perde uma operação válida quando a limpeza falha', async () => {
  const gate = new FaceSearchOperationGate();
  const clear = gate.clear(async () => {
    throw new Error('storage unavailable');
  });
  const search = gate.run(async () => ({
    results: [{ assetId: 'photo-2' }],
  }));

  await assert.rejects(clear, /storage unavailable/);
  assert.deepEqual(await search, {
    results: [{ assetId: 'photo-2' }],
  });
});