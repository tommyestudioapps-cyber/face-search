import assert from 'node:assert/strict';
import test from 'node:test';
import { faceCapture } from '../../../constants/faceCapture.ts';
import {
  calculateAlignmentCrop,
  rotatedDimensions,
} from '../alignmentGeometry.ts';
import {
  getAlignmentLandmarks,
  hasRequiredLandmarks,
} from '../landmarkGeometry.ts';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 900;

function point(x, y) {
  return { x, y, z: 0 };
}

function createFace() {
  const landmarks = Array.from({ length: 363 }, () => point(0.46, 0.42));
  landmarks[33] = point(0.35, 0.4);
  landmarks[133] = point(0.37, 0.4);
  landmarks[263] = point(0.55, 0.4);
  landmarks[362] = point(0.57, 0.4);
  landmarks[1] = point(0.472, 0.51);
  landmarks[61] = point(0.432, 0.58);
  landmarks[291] = point(0.488, 0.58);
  return landmarks;
}

function assertSafeSquareCrop(crop, width, height) {
  assert.equal(crop.width, crop.height);
  assert.ok(crop.width > 0);
  assert.ok(crop.originX >= 0);
  assert.ok(crop.originY >= 0);
  assert.ok(crop.originX + crop.width <= width);
  assert.ok(crop.originY + crop.height <= height);
}

function assertQualityAndAlignmentWork(landmarks) {
  assert.equal(
    hasRequiredLandmarks(landmarks, faceCapture.minLandmarkCount),
    true,
  );

  const dimensions = rotatedDimensions(IMAGE_WIDTH, IMAGE_HEIGHT, 0);
  const crop = calculateAlignmentCrop(
    landmarks,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0,
    dimensions.width,
    dimensions.height,
    faceCapture,
    getAlignmentLandmarks(landmarks),
  );

  assertSafeSquareCrop(crop, dimensions.width, dimensions.height);
}

test('aceita e alinha uma face sem nariz', () => {
  const landmarks = createFace();
  delete landmarks[1];

  assertQualityAndAlignmentWork(landmarks);
  assert.equal(getAlignmentLandmarks(landmarks).nose, null);
});

test('aceita e alinha uma face sem boca', () => {
  const landmarks = createFace();
  delete landmarks[61];
  delete landmarks[291];

  assertQualityAndAlignmentWork(landmarks);
  assert.equal(getAlignmentLandmarks(landmarks).mouth, null);
});

test('rejeita uma face sem um dos olhos obrigatórios', () => {
  const landmarks = createFace();
  delete landmarks[33];

  assert.equal(
    hasRequiredLandmarks(landmarks, faceCapture.minLandmarkCount),
    false,
  );
});