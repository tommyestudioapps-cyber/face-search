import type { FaceLandmark } from './types';

const LANDMARK_GROUPS = {
  leftEye: [33, 133],
  rightEye: [263, 362],
  nose: [1],
  mouth: [61, 291],
} as const;

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

/**
 * The eyes are the landmarks required by alignment. Nose and mouth are
 * useful anchors, but the crop can be calculated from whichever optional
 * anchors are available.
 */
export function hasRequiredLandmarks(
  landmarks: FaceLandmark[],
  minimumLandmarkCount: number,
): boolean {
  if (landmarks.length < minimumLandmarkCount) {
    return false;
  }

  const { leftEye, rightEye } = getAlignmentLandmarks(landmarks);
  return leftEye !== null && rightEye !== null;
}
