import assert from 'node:assert/strict';
import test from 'node:test';
import { faceCapture } from '../../../constants/faceCapture.ts';
import { getAlignmentLandmarks } from '../landmarkGeometry.ts';
import {
  calculateAlignmentCrop,
  rotatedDimensions,
  transformPointForRotation,
} from '../alignmentGeometry.ts';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 900;

function point(x, y) {
  return { x, y, z: 0 };
}

function createFace({ centerX, centerY, rollDegrees }) {
  const roll = (rollDegrees * Math.PI) / 180;
  const eyeHalfDistance = 0.09;
  const eyeOffsetX = eyeHalfDistance * Math.cos(roll);
  const eyeOffsetY = eyeHalfDistance * Math.sin(roll);
  const leftEye = point(centerX - eyeOffsetX, centerY - eyeOffsetY);
  const rightEye = point(centerX + eyeOffsetX, centerY + eyeOffsetY);
  const landmarks = Array.from({ length: 363 }, () => point(centerX, centerY));

  landmarks[33] = point(leftEye.x - 0.008, leftEye.y);
  landmarks[133] = point(leftEye.x + 0.008, leftEye.y);
  landmarks[263] = point(rightEye.x - 0.008, rightEye.y);
  landmarks[362] = point(rightEye.x + 0.008, rightEye.y);
  landmarks[1] = point(centerX + 0.012, centerY + 0.09);
  landmarks[61] = point(centerX - 0.028, centerY + 0.16);
  landmarks[291] = point(centerX + 0.028, centerY + 0.16);

  return landmarks;
}

function expectedAnchor(landmarks, rotationDegrees, outputWidth, outputHeight) {
  const feature = (index) => landmarks[index];
  const leftEye = feature(33);
  const leftEyeOther = feature(133);
  const rightEye = feature(263);
  const rightEyeOther = feature(362);
  const eyeCenter = {
    x: (leftEye.x + leftEyeOther.x + rightEye.x + rightEyeOther.x) / 4,
    y: (leftEye.y + leftEyeOther.y + rightEye.y + rightEyeOther.y) / 4,
  };
  const nose = feature(1);
  const mouth = {
    x: (feature(61).x + feature(291).x) / 2,
    y: (feature(61).y + feature(291).y) / 2,
  };
  const transform = (normalizedPoint) =>
    transformPointForRotation(
      {
        x: normalizedPoint.x * IMAGE_WIDTH,
        y: normalizedPoint.y * IMAGE_HEIGHT,
      },
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      outputWidth,
      outputHeight,
      rotationDegrees,
    );
  const transformedEyeCenter = transform(eyeCenter);
  const transformedNose = transform(nose);
  const transformedMouth = transform(mouth);

  return {
    x:
      transformedEyeCenter.x * 0.35 +
      transformedNose.x * 0.4 +
      transformedMouth.x * 0.25,
    y:
      transformedEyeCenter.y * 0.35 +
      transformedNose.y * 0.4 +
      transformedMouth.y * 0.25,
  };
}

function assertCropIsSafeAndSquare(crop, width, height) {
  assert.equal(crop.width, crop.height);
  assert.ok(crop.width > 0);
  assert.ok(crop.originX >= 0);
  assert.ok(crop.originY >= 0);
  assert.ok(crop.originX + crop.width <= width);
  assert.ok(crop.originY + crop.height <= height);
}

test('centraliza olhos, nariz e boca para inclinações positivas e negativas', () => {
  for (const rollDegrees of [-24, 24]) {
    const landmarks = createFace({
      centerX: 0.43,
      centerY: 0.42,
      rollDegrees,
    });
    const rotationDegrees = -rollDegrees;
    const dimensions = rotatedDimensions(IMAGE_WIDTH, IMAGE_HEIGHT, rotationDegrees);
    const crop = calculateAlignmentCrop(
      landmarks,
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      rotationDegrees,
      dimensions.width,
      dimensions.height,
      faceCapture,
      getAlignmentLandmarks(landmarks),
    );
    const anchor = expectedAnchor(
      landmarks,
      rotationDegrees,
      dimensions.width,
      dimensions.height,
    );
    const cropCenter = {
      x: crop.originX + crop.width / 2,
      y: crop.originY + crop.height / 2,
    };

    assertCropIsSafeAndSquare(crop, dimensions.width, dimensions.height);
    assert.ok(Math.abs(cropCenter.x - anchor.x) <= 1);
    assert.ok(Math.abs(cropCenter.y - anchor.y) <= 1);
  }
});

test('mantém o recorte dentro da imagem quando o rosto encosta no canto superior esquerdo', () => {
  const landmarks = createFace({
    centerX: 0.1,
    centerY: 0.12,
    rollDegrees: 0,
  });
  const crop = calculateAlignmentCrop(
    landmarks,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    faceCapture,
    getAlignmentLandmarks(landmarks),
  );

  assertCropIsSafeAndSquare(crop, IMAGE_WIDTH, IMAGE_HEIGHT);
  assert.equal(crop.originX, 0);
  assert.equal(crop.originY, 0);
});

test('mantém o recorte dentro da imagem quando o rosto encosta no canto inferior direito', () => {
  const landmarks = createFace({
    centerX: 0.88,
    centerY: 0.78,
    rollDegrees: 0,
  });
  const crop = calculateAlignmentCrop(
    landmarks,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    faceCapture,
    getAlignmentLandmarks(landmarks),
  );

  assertCropIsSafeAndSquare(crop, IMAGE_WIDTH, IMAGE_HEIGHT);
  assert.equal(crop.originX + crop.width, IMAGE_WIDTH);
  assert.equal(crop.originY + crop.height, IMAGE_HEIGHT);
});