import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getFaceSizeRatios,
  isFaceInsideNormalizedImage,
  isFaceLargeEnough,
  OUT_OF_FRAME_MARGIN_RATIO,
} from '../qualityGeometry.ts';

const thresholds = {
  minFaceWidthRatio: 0.08,
  minFaceHeightRatio: 0.08,
  minFaceAreaRatio: 0.015,
};

test('checks out-of-frame against the full normalized image with a 2% margin', () => {
  assert.equal(OUT_OF_FRAME_MARGIN_RATIO, 0.02);
  assert.equal(isFaceInsideNormalizedImage({
    minX: -0.02,
    minY: 0.1,
    maxX: 0.8,
    maxY: 1.02,
    width: 0.82,
    height: 0.92,
  }), true);
  assert.equal(isFaceInsideNormalizedImage({
    minX: -0.021,
    minY: 0.1,
    maxX: 0.8,
    maxY: 0.9,
    width: 0.821,
    height: 0.8,
  }), false);
});

test('measures elongated-photo face size relative to the shorter image side', () => {
  const bounds = {
    minX: 0.2,
    minY: 0.2,
    maxX: 0.3,
    maxY: 0.3,
    width: 0.1,
    height: 0.1,
  };
  const ratios = getFaceSizeRatios(bounds, 400, 800);

  assert.equal(ratios.width, 0.1);
  assert.equal(ratios.height, 0.2);
  assert.equal(ratios.area, 0.02);
  assert.equal(isFaceLargeEnough(bounds, 400, 800, thresholds), true);
});

test('preserves the existing normalized size calculation for non-elongated images', () => {
  const bounds = {
    minX: 0.2,
    minY: 0.2,
    maxX: 0.3,
    maxY: 0.35,
    width: 0.1,
    height: 0.15,
  };

  assert.deepEqual(getFaceSizeRatios(bounds, 140, 100), {
    width: 0.1,
    height: 0.15,
    area: 0.015,
  });
  assert.equal(isFaceLargeEnough(bounds, 140, 100, thresholds), true);
});