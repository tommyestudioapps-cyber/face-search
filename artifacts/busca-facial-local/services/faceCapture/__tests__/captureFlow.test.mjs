import assert from 'node:assert/strict';
import test from 'node:test';
import { faceCapture } from '../../../constants/faceCapture.ts';
import { calculateAlignmentCrop } from '../alignmentGeometry.ts';
import {
  getAlignmentLandmarks,
  hasRequiredLandmarks,
} from '../landmarkGeometry.ts';
import { mapNativeResult } from '../nativeAdapterCore.ts';
import {
  getSelectableFaces,
  runFaceCaptureFlow,
} from '../captureFlow.ts';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 900;

function landmark(x, y, z = 0) {
  return { x, y, z };
}

function createPartialFace(missingAnchor) {
  const landmarks = Array.from({ length: 363 }, () => landmark(0.46, 0.42));
  landmarks[33] = landmark(0.35, 0.4);
  landmarks[133] = landmark(0.37, 0.4);
  landmarks[263] = landmark(0.55, 0.4);
  landmarks[362] = landmark(0.57, 0.4);
  landmarks[1] = landmark(0.472, 0.51);
  landmarks[61] = landmark(0.432, 0.58);
  landmarks[291] = landmark(0.488, 0.58);

  if (missingAnchor === 'nose') {
    delete landmarks[1];
  } else {
    delete landmarks[61];
    delete landmarks[291];
  }
  return landmarks;
}

function createQuality(landmarks) {
  const landmarksAccepted = hasRequiredLandmarks(
    landmarks,
    faceCapture.minLandmarkCount,
  );
  return {
    accepted: landmarksAccepted,
    faceSizeAccepted: true,
    faceInFrameAccepted: true,
    landmarksAccepted,
    rotationAccepted: true,
    lightingAccepted: true,
    sharpnessAccepted: true,
    brightness: 128,
    sharpness: 64,
    rollDegrees: 0,
    reason: landmarksAccepted ? 'accepted' : 'landmarks-incomplete',
    issues: landmarksAccepted ? [] : ['landmarks-incomplete'],
  };
}

async function runPartialCaptureSmokeTest(missingAnchor) {
  const landmarks = createPartialFace(missingAnchor);
  const nativeResult = mapNativeResult({
    results: [{ faceLandmarks: [landmarks] }],
    inputImageWidth: IMAGE_WIDTH,
    inputImageHeight: IMAGE_HEIGHT,
  });
  const [nativeFace] = nativeResult.faces;
  const face = {
    id: 0,
    landmarks: nativeFace.landmarks,
    bounds: {
      minX: nativeFace.boundingBox.x,
      minY: nativeFace.boundingBox.y,
      maxX: nativeFace.boundingBox.x + nativeFace.boundingBox.width,
      maxY: nativeFace.boundingBox.y + nativeFace.boundingBox.height,
      width: nativeFace.boundingBox.width,
      height: nativeFace.boundingBox.height,
    },
    boundingBox: nativeFace.boundingBox,
    rollDegrees: 0,
    confidence: null,
    confidenceSource: 'mediapipe-threshold',
    quality: createQuality(nativeFace.landmarks),
  };
  const session = {
    sourceUri: 'synthetic://partial-face',
    normalizedUri: 'synthetic://normalized-face',
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    faces: [face],
    temporaryUris: ['synthetic://normalized-face'],
  };
  const statuses = [];
  let selectedFaceId = null;
  let alignedFace = null;
  let callbackSession = null;

  const result = await runFaceCaptureFlow(
    session.sourceUri,
    {
      detectFaces: async () => session,
      alignSelectedFace: async (nextSession, faceId) => {
        const selectedFace = nextSession.faces.find((candidate) => candidate.id === faceId);
        const keyLandmarks = getAlignmentLandmarks(selectedFace.landmarks);
        const crop = calculateAlignmentCrop(
          selectedFace.landmarks,
          nextSession.width,
          nextSession.height,
          selectedFace.rollDegrees,
          nextSession.width,
          nextSession.height,
          faceCapture,
          keyLandmarks,
        );
        return {
          uri: `synthetic://aligned-${missingAnchor}`,
          width: faceCapture.alignedFaceSize,
          height: faceCapture.alignedFaceSize,
          faceId,
          standardized: true,
          sourceUri: nextSession.normalizedUri,
          rotationDegrees: 0,
          crop,
        };
      },
      releaseFaceDetectionSession: async () => {},
      getFaceQualityError: () => new Error('quality rejected'),
    },
    {
      onStatus: (status) => statuses.push(status),
      onSession: (nextSession) => {
        callbackSession = nextSession;
      },
      onFaces: () => {},
      onSelectedFaceId: (faceId) => {
        selectedFaceId = faceId;
      },
      onAlignedFace: (nextAlignedFace) => {
        alignedFace = nextAlignedFace;
      },
    },
  );

  assert.deepEqual(statuses, [
    'preparing',
    'detecting',
    'validating',
    'aligning',
    'completed',
  ]);
  assert.equal(statuses.includes('landmarks-incomplete'), false);
  assert.equal(statuses.at(-1), 'completed');
  assert.equal(result, session);
  assert.equal(callbackSession, session);
  assert.equal(selectedFaceId, 0);
  assert.equal(alignedFace.faceId, 0);
  assert.equal(alignedFace.standardized, true);
  assert.ok(alignedFace.crop.width > 0);
  assert.equal(getSelectableFaces(session.faces).length, 1);
  assert.equal(face.quality.landmarksAccepted, true);
  assert.equal(face.quality.issues.includes('landmarks-incomplete'), false);
}

test('percorre a captura completa quando o nariz está ausente', async () => {
  await runPartialCaptureSmokeTest('nose');
});

test('percorre a captura completa quando a boca está ausente', async () => {
  await runPartialCaptureSmokeTest('mouth');
});