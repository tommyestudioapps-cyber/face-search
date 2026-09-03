import assert from 'node:assert/strict';
import test from 'node:test';
import {
  averageLandmarks,
  calculateFacePose,
  getAlignmentLandmarks,
  getLandmark,
  isFacePoseWithinLimits,
} from '../landmarkGeometry.ts';

function point(x, y, z = 0) {
  return { x, y, z };
}

function createFace() {
  const landmarks = Array.from({ length: 363 }, () => point(0.5, 0.5));
  landmarks[33] = point(0.4, 0.4);
  landmarks[133] = point(0.42, 0.4);
  landmarks[263] = point(0.58, 0.4);
  landmarks[362] = point(0.6, 0.4);
  landmarks[1] = point(0.51, 0.49);
  landmarks[61] = point(0.47, 0.6);
  landmarks[291] = point(0.53, 0.6);
  return landmarks;
}

function assertPointClose(actual, expected) {
  assert.ok(actual);
  assert.ok(Math.abs(actual.x - expected.x) < Number.EPSILON * 4);
  assert.ok(Math.abs(actual.y - expected.y) < Number.EPSILON * 4);
  assert.equal(actual.z, expected.z);
}

test('trata o nariz ausente como opcional sem perder os olhos', () => {
  const landmarks = createFace();
  delete landmarks[1];

  const alignmentLandmarks = getAlignmentLandmarks(landmarks);

  assertPointClose(alignmentLandmarks.leftEye, point(0.41, 0.4));
  assertPointClose(alignmentLandmarks.rightEye, point(0.59, 0.4));
  assert.equal(alignmentLandmarks.nose, null);
  assertPointClose(alignmentLandmarks.mouth, point(0.5, 0.6));
});

test('trata a boca ausente como opcional e preserva os landmarks disponíveis', () => {
  const landmarks = createFace();
  delete landmarks[61];
  delete landmarks[291];

  const alignmentLandmarks = getAlignmentLandmarks(landmarks);

  assertPointClose(alignmentLandmarks.leftEye, point(0.41, 0.4));
  assertPointClose(alignmentLandmarks.rightEye, point(0.59, 0.4));
  assertPointClose(alignmentLandmarks.nose, point(0.51, 0.49));
  assert.equal(alignmentLandmarks.mouth, null);
});

test('ignora landmarks com coordenadas não finitas', () => {
  const landmarks = createFace();
  landmarks[1] = point(Number.NaN, 0.49);

  assert.equal(getLandmark(1, landmarks), null);
  assert.equal(averageLandmarks([1], landmarks), null);
});

test('calcula uma pose frontal estável com os landmarks disponíveis', () => {
  const pose = calculateFacePose(createFace());

  assert.equal(pose.rollDegrees, 0);
  assert.ok(pose.yawDegrees !== null);
  assert.ok(Math.abs(pose.yawDegrees) < 10);
  assert.ok(pose.pitchDegrees !== null);
  assert.ok(Math.abs(pose.pitchDegrees) < 10);
});

test('não rejeita a pose quando nariz ou boca são opcionais', () => {
  const withoutNose = createFace();
  delete withoutNose[1];
  const withoutMouth = createFace();
  delete withoutMouth[61];
  delete withoutMouth[291];
  const limits = {
    maxYawDegrees: 35,
    maxPitchDegrees: 30,
    maxRollDegrees: 35,
  };

  const noseMissingPose = calculateFacePose(withoutNose);
  const mouthMissingPose = calculateFacePose(withoutMouth);

  assert.equal(noseMissingPose.yawDegrees, null);
  assert.equal(noseMissingPose.pitchDegrees, null);
  assert.equal(isFacePoseWithinLimits(noseMissingPose, limits), true);
  assert.equal(mouthMissingPose.pitchDegrees, null);
  assert.equal(isFacePoseWithinLimits(mouthMissingPose, limits), true);
});

test('aplica os limites de yaw, pitch e roll inclusive nos extremos', () => {
  const limits = {
    maxYawDegrees: 35,
    maxPitchDegrees: 30,
    maxRollDegrees: 35,
  };
  const atLimits = {
    yawDegrees: 35,
    pitchDegrees: -30,
    rollDegrees: -35,
  };

  assert.equal(isFacePoseWithinLimits(atLimits, limits), true);
  assert.equal(
    isFacePoseWithinLimits({ ...atLimits, yawDegrees: 35.01 }, limits),
    false,
  );
  assert.equal(
    isFacePoseWithinLimits({ ...atLimits, pitchDegrees: -30.01 }, limits),
    false,
  );
  assert.equal(
    isFacePoseWithinLimits({ ...atLimits, rollDegrees: -35.01 }, limits),
    false,
  );
});