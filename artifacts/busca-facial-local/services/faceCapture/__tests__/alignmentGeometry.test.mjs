import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAlignmentCrop,
  rotatedDimensions,
  transformPointForRotation,
} from '../alignmentGeometry.ts';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 900;

function createEyePair({ centerX, centerY, rollDegrees, eyeHalfDistance = 0.09 }) {
  const roll = (rollDegrees * Math.PI) / 180;
  const eyeOffsetX = eyeHalfDistance * Math.cos(roll);
  const eyeOffsetY = eyeHalfDistance * Math.sin(roll);
  return {
    leftEye: { x: centerX - eyeOffsetX, y: centerY - eyeOffsetY, z: 0 },
    rightEye: { x: centerX + eyeOffsetX, y: centerY + eyeOffsetY, z: 0 },
  };
}

const TEMPLATE_EYE_DISTANCE = Math.hypot(
  73.5318 - 38.2946,
  51.5014 - 51.6963,
);
const TEMPLATE_EYE_CENTER_X_RATIO = ((38.2946 + 73.5318) / 2) / 112;
const TEMPLATE_EYE_CENTER_Y_RATIO = ((51.6963 + 51.5014) / 2) / 112;

function assertCropIsSafeAndSquare(crop, width, height) {
  assert.equal(crop.width, crop.height);
  assert.ok(crop.width > 0);
  assert.ok(crop.originX >= 0);
  assert.ok(crop.originY >= 0);
  assert.ok(crop.originX + crop.width <= width);
  assert.ok(crop.originY + crop.height <= height);
}

test('posiciona os olhos no template canônico para inclinações positivas, negativas e neutras', () => {
  for (const rollDegrees of [-24, 0, 24]) {
    const { leftEye, rightEye } = createEyePair({
      centerX: 0.43,
      centerY: 0.42,
      rollDegrees,
    });
    const rotationDegrees = -rollDegrees;
    const dimensions = rotatedDimensions(IMAGE_WIDTH, IMAGE_HEIGHT, rotationDegrees);
    const crop = calculateAlignmentCrop(
      leftEye,
      rightEye,
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      rotationDegrees,
      dimensions.width,
      dimensions.height,
    );
    const transformEye = (eye) =>
      transformPointForRotation(
        {
          x: eye.x * IMAGE_WIDTH,
          y: eye.y * IMAGE_HEIGHT,
        },
        IMAGE_WIDTH,
        IMAGE_HEIGHT,
        dimensions.width,
        dimensions.height,
        rotationDegrees,
      );
    const transformedLeftEye = transformEye(leftEye);
    const transformedRightEye = transformEye(rightEye);
    const eyeCenterRotated = {
      x: (transformedLeftEye.x + transformedRightEye.x) / 2,
      y: (transformedLeftEye.y + transformedRightEye.y) / 2,
    };

    assertCropIsSafeAndSquare(crop, dimensions.width, dimensions.height);
    const expectedX = TEMPLATE_EYE_CENTER_X_RATIO * crop.width;
    const expectedY = TEMPLATE_EYE_CENTER_Y_RATIO * crop.height;
    const actualX = eyeCenterRotated.x - crop.originX;
    const actualY = eyeCenterRotated.y - crop.originY;
    assert.ok(Math.abs(actualX - expectedX) <= 1);
    assert.ok(Math.abs(actualY - expectedY) <= 1);
  }
});

test('mantém o recorte dentro da imagem quando os olhos encostam no canto superior esquerdo', () => {
  const { leftEye, rightEye } = createEyePair({
    centerX: 0.1,
    centerY: 0.12,
    rollDegrees: 0,
  });
  const crop = calculateAlignmentCrop(
    leftEye,
    rightEye,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
  );

  assertCropIsSafeAndSquare(crop, IMAGE_WIDTH, IMAGE_HEIGHT);
  assert.equal(crop.originX, 0);
  assert.equal(crop.originY, 0);
});

test('mantém o recorte dentro da imagem quando os olhos encostam no canto inferior direito', () => {
  const { leftEye, rightEye } = createEyePair({
    centerX: 0.88,
    centerY: 0.78,
    rollDegrees: 0,
  });
  const crop = calculateAlignmentCrop(
    leftEye,
    rightEye,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
  );

  assertCropIsSafeAndSquare(crop, IMAGE_WIDTH, IMAGE_HEIGHT);
  assert.equal(crop.originX + crop.width, IMAGE_WIDTH);
  assert.equal(crop.originY + crop.height, IMAGE_HEIGHT);
});

test('escala proporcionalmente à distância interocular', () => {
  const smallPair = createEyePair({
    centerX: 0.46,
    centerY: 0.42,
    rollDegrees: 0,
    eyeHalfDistance: 0.06,
  });
  const largePair = createEyePair({
    centerX: 0.46,
    centerY: 0.42,
    rollDegrees: 0,
    eyeHalfDistance: 0.12,
  });
  const smallCrop = calculateAlignmentCrop(
    smallPair.leftEye,
    smallPair.rightEye,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
  );
  const largeCrop = calculateAlignmentCrop(
    largePair.leftEye,
    largePair.rightEye,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    0,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
  );

  assertCropIsSafeAndSquare(smallCrop, IMAGE_WIDTH, IMAGE_HEIGHT);
  assertCropIsSafeAndSquare(largeCrop, IMAGE_WIDTH, IMAGE_HEIGHT);
  assert.ok(Math.abs(largeCrop.width - smallCrop.width * 2) <= 1);
});

test('mantém a distância interocular proporcional ao template após a rotação', () => {
  for (const rollDegrees of [-30, -15, 0, 15, 30]) {
    const { leftEye, rightEye } = createEyePair({
      centerX: 0.43,
      centerY: 0.42,
      rollDegrees,
    });
    const rotationDegrees = -rollDegrees;
    const dimensions = rotatedDimensions(IMAGE_WIDTH, IMAGE_HEIGHT, rotationDegrees);
    const crop = calculateAlignmentCrop(
      leftEye,
      rightEye,
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      rotationDegrees,
      dimensions.width,
      dimensions.height,
    );
    const transformEye = (eye) =>
      transformPointForRotation(
        {
          x: eye.x * IMAGE_WIDTH,
          y: eye.y * IMAGE_HEIGHT,
        },
        IMAGE_WIDTH,
        IMAGE_HEIGHT,
        dimensions.width,
        dimensions.height,
        rotationDegrees,
      );
    const transformedLeftEye = transformEye(leftEye);
    const transformedRightEye = transformEye(rightEye);
    const eyeDistance = Math.hypot(
      transformedRightEye.x - transformedLeftEye.x,
      transformedRightEye.y - transformedLeftEye.y,
    );

    assertCropIsSafeAndSquare(crop, dimensions.width, dimensions.height);
    assert.ok(Math.abs((crop.width * TEMPLATE_EYE_DISTANCE) / 112 - eyeDistance) <= 1);
  }
});