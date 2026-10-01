import { getAlignmentLandmarks } from './landmarkGeometry';
import type {
  FaceBoundingBox,
  FaceLandmark,
  NativeDetectedFace,
} from './types';

export const MAX_DETECTION_WINDOWS = 5;
export const ELONGATED_IMAGE_RATIO = 1.4;
export const DUPLICATE_FACE_IOU_THRESHOLD = 0.4;
export const DUPLICATE_EYE_DISTANCE_RATIO = 0.5;

export interface DetectionWindow {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionWindowLayout {
  windows: DetectionWindow[];
  ratio: number;
  elongated: boolean;
  coverage: number;
}

export interface WindowedFaceDetection extends NativeDetectedFace {
  windowIndex: number;
  sourceWindow: DetectionWindow;
  edgeDistancePx: number;
}

export function createDetectionWindowLayout(
  imageWidth: number,
  imageHeight: number,
): DetectionWindowLayout {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    throw new RangeError('Detection window dimensions must be positive.');
  }

  const shortSide = Math.min(imageWidth, imageHeight);
  const longSide = Math.max(imageWidth, imageHeight);
  const ratio = longSide / shortSide;
  const elongated = ratio > ELONGATED_IMAGE_RATIO;

  if (!elongated) {
    return {
      windows: [{ index: 0, x: 0, y: 0, width: imageWidth, height: imageHeight }],
      ratio,
      elongated: false,
      coverage: 1,
    };
  }

  const count = Math.min(
    MAX_DETECTION_WINDOWS,
    1 + Math.ceil(2 * (ratio - 1)),
  );
  const travel = longSide - shortSide;
  const spacing = count > 1 ? travel / (count - 1) : 0;
  const windows = Array.from({ length: count }, (_, index) => {
    const position =
      index === count - 1
        ? travel
        : Math.round(spacing * index);
    return imageWidth >= imageHeight
      ? {
          index,
          x: position,
          y: 0,
          width: shortSide,
          height: shortSide,
        }
      : {
          index,
          x: 0,
          y: position,
          width: shortSide,
          height: shortSide,
        };
  });

  return {
    windows,
    ratio,
    elongated: true,
    coverage: Math.min(1, (windows.length * shortSide) / longSide),
  };
}

function getNormalizedBox(box: FaceBoundingBox, window: DetectionWindow) {
  if (box.coordinateSpace === 'normalized') {
    return box;
  }

  return {
    x: box.x / window.width,
    y: box.y / window.height,
    width: box.width / window.width,
    height: box.height / window.height,
    coordinateSpace: 'normalized' as const,
  };
}

export function mapWindowFacesToImage(
  faces: NativeDetectedFace[],
  window: DetectionWindow,
  imageWidth: number,
  imageHeight: number,
): WindowedFaceDetection[] {
  return faces.map((face) => {
    const localBox = getNormalizedBox(face.boundingBox, window);
    const landmarks = face.landmarks.map((landmark) => ({
      ...landmark,
      x: (window.x + landmark.x * window.width) / imageWidth,
      y: (window.y + landmark.y * window.height) / imageHeight,
    }));
    const boundingBox: FaceBoundingBox = {
      x: (window.x + localBox.x * window.width) / imageWidth,
      y: (window.y + localBox.y * window.height) / imageHeight,
      width: (localBox.width * window.width) / imageWidth,
      height: (localBox.height * window.height) / imageHeight,
      coordinateSpace: 'normalized',
    };
    const edgeDistancePx = Math.min(
      localBox.x * window.width,
      localBox.y * window.height,
      (1 - localBox.x - localBox.width) * window.width,
      (1 - localBox.y - localBox.height) * window.height,
    );

    return {
      landmarks,
      boundingBox,
      windowIndex: window.index,
      sourceWindow: window,
      edgeDistancePx,
    };
  });
}

export function intersectionOverUnion(
  left: FaceBoundingBox,
  right: FaceBoundingBox,
): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const union =
    left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function distanceInPixels(
  left: FaceLandmark,
  right: FaceLandmark,
  imageWidth: number,
  imageHeight: number,
): number {
  return Math.hypot(
    (left.x - right.x) * imageWidth,
    (left.y - right.y) * imageHeight,
  );
}

function eyeCentersAreNear(
  left: WindowedFaceDetection,
  right: WindowedFaceDetection,
  imageWidth: number,
  imageHeight: number,
): boolean {
  const leftEyes = getAlignmentLandmarks(left.landmarks);
  const rightEyes = getAlignmentLandmarks(right.landmarks);
  if (
    !leftEyes.leftEye ||
    !leftEyes.rightEye ||
    !rightEyes.leftEye ||
    !rightEyes.rightEye
  ) {
    return false;
  }

  const interocularDistance =
    (distanceInPixels(
      leftEyes.leftEye,
      leftEyes.rightEye,
      imageWidth,
      imageHeight,
    ) +
      distanceInPixels(
        rightEyes.leftEye,
        rightEyes.rightEye,
        imageWidth,
        imageHeight,
      )) /
    2;
  const matchingEyeDistance =
    (distanceInPixels(
      leftEyes.leftEye,
      rightEyes.leftEye,
      imageWidth,
      imageHeight,
    ) +
      distanceInPixels(
        leftEyes.rightEye,
        rightEyes.rightEye,
        imageWidth,
        imageHeight,
      )) /
    2;

  return (
    interocularDistance > 0 &&
    matchingEyeDistance <
      DUPLICATE_EYE_DISTANCE_RATIO * interocularDistance
  );
}

function isDuplicate(
  left: WindowedFaceDetection,
  right: WindowedFaceDetection,
  imageWidth: number,
  imageHeight: number,
): boolean {
  return (
    intersectionOverUnion(left.boundingBox, right.boundingBox) >
      DUPLICATE_FACE_IOU_THRESHOLD ||
    eyeCentersAreNear(left, right, imageWidth, imageHeight)
  );
}

export function deduplicateWindowFaces(
  faces: WindowedFaceDetection[],
  imageWidth: number,
  imageHeight: number,
): WindowedFaceDetection[] {
  const bestFirst = [...faces].sort(
    (left, right) => right.edgeDistancePx - left.edgeDistancePx,
  );
  const kept: WindowedFaceDetection[] = [];

  for (const candidate of bestFirst) {
    const duplicatesKeptFace = kept.some(
      (existing) =>
        existing.windowIndex !== candidate.windowIndex &&
        isDuplicate(existing, candidate, imageWidth, imageHeight),
    );
    if (!duplicatesKeptFace) {
      kept.push(candidate);
    }
  }

  return kept;
}