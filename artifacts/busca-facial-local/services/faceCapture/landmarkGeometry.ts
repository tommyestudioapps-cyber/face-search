import type { FaceLandmark } from './types';

const LANDMARK_GROUPS = {
  leftEye: [33, 133],
  rightEye: [263, 362],
  nose: [1],
  mouth: [61, 291],
} as const;

const DEGREES_PER_RADIAN = 180 / Math.PI;
const NEUTRAL_NOSE_TO_MOUTH_RATIO = 0.6;

function isUsableLandmark(
  landmark: FaceLandmark | null | undefined,
): landmark is FaceLandmark {
  return (
    landmark !== null &&
    landmark !== undefined &&
    Number.isFinite(landmark.x) &&
    Number.isFinite(landmark.y) &&
    Number.isFinite(landmark.z)
  );
}

export function getLandmark(index: number, landmarks: FaceLandmark[]): FaceLandmark | null {
  const landmark = landmarks[index];
  return isUsableLandmark(landmark) ? landmark : null;
}

export function averageLandmarks(
  indexes: readonly number[],
  landmarks: FaceLandmark[],
): FaceLandmark | null {
  const points = indexes
    .map((index) => getLandmark(index, landmarks))
    .filter((point): point is FaceLandmark => point !== null);

  if (points.length !== indexes.length) {
    return null;
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
}

export function getAlignmentLandmarks(landmarks: FaceLandmark[]) {
  return {
    leftEye: averageLandmarks(LANDMARK_GROUPS.leftEye, landmarks),
    rightEye: averageLandmarks(LANDMARK_GROUPS.rightEye, landmarks),
    nose: averageLandmarks(LANDMARK_GROUPS.nose, landmarks),
    mouth: averageLandmarks(LANDMARK_GROUPS.mouth, landmarks),
  };
}

export function calculateRollDegrees(landmarks: FaceLandmark[]): number {
  const { leftEye, rightEye } = getAlignmentLandmarks(landmarks);
  if (!leftEye || !rightEye) {
    return 0;
  }
  return (
    Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) *
    DEGREES_PER_RADIAN
  );
}

export interface FacePose {
  yawDegrees: number | null;
  pitchDegrees: number | null;
  rollDegrees: number;
}

export interface FacePoseLimits {
  maxYawDegrees: number;
  maxPitchDegrees: number;
  maxRollDegrees: number;
}

function distanceBetween(first: FaceLandmark, second: FaceLandmark): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function calculateYawDegrees(landmarks: FaceLandmark[]): number | null {
  const { leftEye, rightEye, nose } = getAlignmentLandmarks(landmarks);
  if (!leftEye || !rightEye || !nose) {
    return null;
  }

  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeDistance = distanceBetween(leftEye, rightEye);
  if (eyeDistance <= 0) {
    return null;
  }

  return (
    Math.atan2(nose.x - eyeCenterX, eyeDistance) *
    DEGREES_PER_RADIAN
  );
}

export function calculatePitchDegrees(landmarks: FaceLandmark[]): number | null {
  const { leftEye, rightEye, nose, mouth } = getAlignmentLandmarks(landmarks);
  if (!leftEye || !rightEye || !nose || !mouth) {
    return null;
  }

  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  const eyeToMouthDistance = mouth.y - eyeCenterY;
  if (eyeToMouthDistance <= 0) {
    return null;
  }

  const noseToEyeDistance = nose.y - eyeCenterY;
  const neutralNoseToEyeDistance =
    eyeToMouthDistance * NEUTRAL_NOSE_TO_MOUTH_RATIO;

  return (
    Math.atan2(
      noseToEyeDistance - neutralNoseToEyeDistance,
      eyeToMouthDistance,
    ) * DEGREES_PER_RADIAN
  );
}

export function calculateFacePose(landmarks: FaceLandmark[]): FacePose {
  return {
    yawDegrees: calculateYawDegrees(landmarks),
    pitchDegrees: calculatePitchDegrees(landmarks),
    rollDegrees: calculateRollDegrees(landmarks),
  };
}

export function isFacePoseWithinLimits(
  pose: FacePose,
  limits: FacePoseLimits,
): boolean {
  return (
    Math.abs(pose.rollDegrees) <= limits.maxRollDegrees &&
    (pose.yawDegrees === null ||
      Math.abs(pose.yawDegrees) <= limits.maxYawDegrees) &&
    (pose.pitchDegrees === null ||
      Math.abs(pose.pitchDegrees) <= limits.maxPitchDegrees)
  );
}

/**
 * The eyes are the landmarks required by alignment. Nose and mouth are
 * useful anchors, but the crop can be calculated from whichever optional
 * anchors are available. The second argument is retained for callers that
 * still pass the historical minimum count; it is intentionally not used.
 */
export function hasRequiredLandmarks(
  landmarks: FaceLandmark[],
  _minimumLandmarkCount?: number,
): boolean {
  const { leftEye, rightEye } = getAlignmentLandmarks(landmarks);
  return leftEye !== null && rightEye !== null;
}
