import assert from 'node:assert/strict';
import test from 'node:test';
import { getFaceOverlayLayout } from '../faceOverlayLayout.ts';

function bounds(minX, minY, width, height) {
  return {
    minX,
    minY,
    maxX: minX + width,
    maxY: minY + height,
    width,
    height,
  };
}

function assertLayout(actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 0.000001,
      `${key}: expected ${expected[key]}, received ${actual[key]}`,
    );
  }
}

test('mantém cada bounding box independente em uma imagem paisagem com cover', () => {
  const first = getFaceOverlayLayout(bounds(0.1, 0.2, 0.2, 0.3), 1600, 900);
  const second = getFaceOverlayLayout(bounds(0.7, 0.2, 0.2, 0.3), 1600, 900);

  assertLayout(first, {
    left: -21.111111111111107,
    top: 20,
    width: 35.55555555555556,
    height: 30,
  });
  assertLayout(second, {
    left: 85.55555555555556,
    top: 20,
    width: 35.55555555555556,
    height: 30,
  });
  assert.notEqual(first.left, second.left);
});

test('mantém cada bounding box independente em uma imagem retrato com cover', () => {
  const first = getFaceOverlayLayout(bounds(0.1, 0.2, 0.2, 0.3), 900, 1600);
  const second = getFaceOverlayLayout(bounds(0.7, 0.2, 0.2, 0.3), 900, 1600);

  assertLayout(first, {
    left: 10,
    top: -3.3333333333333286,
    width: 20,
    height: 53.33333333333333,
  });
  assertLayout(second, {
    left: 70,
    top: -3.3333333333333286,
    width: 20,
    height: 53.33333333333333,
  });
  assert.notEqual(first.left, second.left);
});