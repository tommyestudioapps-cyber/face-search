import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getNativeErrorDetails,
  mapNativeResult,
} from '../nativeAdapterCore.ts';
import {
  getAlignmentLandmarks,
  hasRequiredLandmarks,
} from '../landmarkGeometry.ts';
import { calculateAlignmentCrop } from '../alignmentGeometry.ts';
import { faceCapture } from '../../../constants/faceCapture.ts';

function landmark(x, y, z = 0) {
  return { x, y, z };
}

function createNativeFace() {
  const landmarks = Array.from({ length: 363 }, () => landmark(0.46, 0.42));
  landmarks[33] = landmark(0.35, 0.4);
  landmarks[133] = landmark(0.37, 0.4);
  landmarks[263] = landmark(0.55, 0.4);
  landmarks[362] = landmark(0.57, 0.4);
  landmarks[1] = landmark(0.472, 0.51);
  landmarks[61] = landmark(0.432, 0.58);
  landmarks[291] = landmark(0.488, 0.58);
  return landmarks;
}

function assertNativePartialFaceReachesAlignment(faceLandmarks, missingAnchor) {
  const result = mapNativeResult({
    results: [{ faceLandmarks: [faceLandmarks] }],
  });
  const [face] = result.faces;

  assert.ok(face);
  assert.equal(hasRequiredLandmarks(face.landmarks, faceCapture.minLandmarkCount), true);
  assert.equal(getAlignmentLandmarks(face.landmarks)[missingAnchor], null);

  const crop = calculateAlignmentCrop(
    face.landmarks,
    1200,
    900,
    0,
    1200,
    900,
    faceCapture,
    getAlignmentLandmarks(face.landmarks),
  );
  assert.equal(crop.width, crop.height);
  assert.ok(crop.width > 0);
  assert.ok(crop.originX >= 0);
  assert.ok(crop.originY >= 0);
  assert.ok(crop.originX + crop.width <= 1200);
  assert.ok(crop.originY + crop.height <= 900);
}

test('retorna zero faces quando o MediaPipe não encontra landmarks', () => {
  const result = mapNativeResult({
    results: [{ faceLandmarks: [] }],
    inputImageHeight: 480,
    inputImageWidth: 640,
    inferenceTime: 12,
  });

  assert.deepEqual(result.faces, []);
  assert.equal(result.inputImageHeight, 480);
  assert.equal(result.inputImageWidth, 640);
  assert.equal(result.inferenceTime, 12);
});

test('mapeia uma face e calcula sua bounding box normalizada', () => {
  const faceLandmarks = [
    landmark(0.2, 0.3, -0.1),
    landmark(0.6, 0.3),
    landmark(0.4, 0.8, 0.2),
  ];

  const result = mapNativeResult({
    results: [{ faceLandmarks: [faceLandmarks] }],
  });

  assert.equal(result.faces.length, 1);
  assert.deepEqual(result.faces[0].landmarks, faceLandmarks);
  assert.deepEqual(result.faces[0].boundingBox, {
    x: 0.2,
    y: 0.3,
    width: 0.39999999999999997,
    height: 0.5,
    coordinateSpace: 'normalized',
  });
});

test('achata várias faces do mesmo frame sem misturar seus landmarks', () => {
  const firstFace = [
    landmark(0.1, 0.2),
    landmark(0.3, 0.2),
    landmark(0.2, 0.5),
  ];
  const secondFace = [
    landmark(0.7, 0.1),
    landmark(0.9, 0.1),
    landmark(0.8, 0.4),
  ];

  const result = mapNativeResult({
    results: [{ faceLandmarks: [firstFace, secondFace] }],
  });

  assert.equal(result.faces.length, 2);
  assert.deepEqual(result.faces.map((face) => face.landmarks), [
    firstFace,
    secondFace,
  ]);
  assert.deepEqual(result.faces.map((face) => face.boundingBox), [
    {
      x: 0.1,
      y: 0.2,
      width: 0.19999999999999998,
      height: 0.3,
      coordinateSpace: 'normalized',
    },
    {
      x: 0.7,
      y: 0.1,
      width: 0.20000000000000007,
      height: 0.30000000000000004,
      coordinateSpace: 'normalized',
    },
  ]);
});

test('preserva uma face nativa sem nariz até o alinhamento', () => {
  const landmarks = createNativeFace();
  delete landmarks[1];

  assertNativePartialFaceReachesAlignment(landmarks, 'nose');
});

test('preserva uma face nativa sem boca até o alinhamento', () => {
  const landmarks = createNativeFace();
  delete landmarks[61];
  delete landmarks[291];

  assertNativePartialFaceReachesAlignment(landmarks, 'mouth');
});

test('preserva mensagens específicas para falhas de modelo, imagem e módulo nativo', () => {
  assert.deepEqual(
    getNativeErrorDetails(new Error('Could not load model asset')),
    {
      code: 'model-unavailable',
      message: 'O modelo facial local não foi encontrado no APK.',
    },
  );
  assert.deepEqual(
    getNativeErrorDetails(new Error('Unable to decode image path')),
    {
      code: 'invalid-image',
      message: 'O arquivo temporário não pôde ser lido pelo detector facial.',
    },
  );
  assert.deepEqual(
    getNativeErrorDetails(new Error('native module not available')),
    {
      code: 'native-module-unavailable',
      message: 'O módulo nativo de captura facial não está disponível neste APK.',
    },
  );
});