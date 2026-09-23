import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPauseBatch } from '../batchPolicy.ts';
import { parseCheckpoint } from '../checkpointPolicy.ts';

test('um lote não inicia trabalho novo após o prazo ou limite de fotos', () => {
  assert.equal(shouldPauseBatch(0, 16, 16_000, 15_000), true);
  assert.equal(shouldPauseBatch(0, 16, 14_000, 15_000), false);
  assert.equal(shouldPauseBatch(1, 16, 14_999, 15_000), false);
  assert.equal(shouldPauseBatch(1, 16, 15_000, 15_000), true);
  assert.equal(shouldPauseBatch(16, 16, 500, 15_000), true);
});

test('cursor válido é retomado; modelo diferente ou dado inválido reinicia a varredura', () => {
  const cursor = JSON.stringify({ version: 'model:192', cursor: 'page-7', generation: 2 });
  assert.deepEqual(parseCheckpoint(cursor, 'model:192'), { cursor: 'page-7', generation: 2 });
  assert.equal(parseCheckpoint(cursor, 'model:128'), undefined);
  assert.equal(parseCheckpoint('not json', 'model:192'), undefined);
  assert.equal(parseCheckpoint(JSON.stringify({ version: 'model:192', cursor: '' }), 'model:192'), undefined);
  assert.equal(parseCheckpoint(JSON.stringify({ version: 'model:192', cursor: 'page-7' }), 'model:192'), undefined);
  assert.equal(parseCheckpoint(JSON.stringify({ version: 'model:192', cursor: 'page-7', generation: 0 }), 'model:192'), undefined);
});