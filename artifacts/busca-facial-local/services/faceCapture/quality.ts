import * as jpeg from 'jpeg-js';
import { File } from 'expo-file-system';
import { faceCapture } from '@/constants/faceCapture';
import type {
  DetectedFace,
  FaceBounds,
  FaceBoundingBox,
  FaceLandmark,
  FaceQuality,
  FaceQualityIssue,
} from './types';
import { FaceCaptureError } from './types';

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

const LANDMARK_GROUPS = {
  leftEye: [33, 133],
  rightEye: [263, 362],
  nose: [1],
  mouth: [61, 291],
} as const;

export function getLandmark(index: number, landmarks: FaceLandmark[]): FaceLandmark | null {
  return landmarks[index] ?? null;
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

export function calculateFaceBounds(landmarks: FaceLandmark[]): FaceBounds {
  if (landmarks.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...landmarks.map((point) => point.x));
  const minY = Math.min(...landmarks.map((point) => point.y));
  const maxX = Math.max(...landmarks.map((point) => point.x));
  const maxY = Math.max(...landmarks.map((point) => point.y));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function calculateRollDegrees(landmarks: FaceLandmark[]): number {
  const { leftEye, rightEye } = getAlignmentLandmarks(landmarks);
  if (!leftEye || !rightEye) {
    return 0;
  }
  return (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI;
}

async function decodeImage(uri: string): Promise<DecodedImage> {
  try {
    const bytes = await new File(uri).bytes();
    const decoded = jpeg.decode(bytes, { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao ler pixels da imagem.';
    throw new FaceCaptureError('invalid-image', message);
  }
}

function pixelBrightness(data: Uint8Array, offset: number): number {
  return 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
}

function analyzePixels(image: DecodedImage, bounds: FaceBounds) {
  const startX = Math.max(1, Math.floor(bounds.minX * image.width));
  const endX = Math.min(image.width - 2, Math.ceil(bounds.maxX * image.width));
  const startY = Math.max(1, Math.floor(bounds.minY * image.height));
  const endY = Math.min(image.height - 2, Math.ceil(bounds.maxY * image.height));
  const brightnessValues: number[] = [];
  let sharpnessTotal = 0;
  let sharpnessSamples = 0;

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      const current = pixelBrightness(image.data, offset);
      brightnessValues.push(current);

      const left = pixelBrightness(image.data, (y * image.width + x - 1) * 4);
      const right = pixelBrightness(image.data, (y * image.width + x + 1) * 4);
      const top = pixelBrightness(image.data, ((y - 1) * image.width + x) * 4);
      const bottom = pixelBrightness(image.data, ((y + 1) * image.width + x) * 4);
      const laplacian = Math.abs(4 * current - left - right - top - bottom);
      sharpnessTotal += laplacian * laplacian;
      sharpnessSamples += 1;
    }
  }

  const brightness =
    brightnessValues.length > 0
      ? brightnessValues.reduce((sum, value) => sum + value, 0) / brightnessValues.length
      : null;
  const sharpness = sharpnessSamples > 0 ? Math.sqrt(sharpnessTotal / sharpnessSamples) : null;

  return { brightness, sharpness };
}

export async function evaluateFaceQuality(
  sampleUri: string,
  imageWidth: number,
  imageHeight: number,
  landmarks: FaceLandmark[],
  confidenceAccepted: boolean,
): Promise<{ bounds: FaceBounds; rollDegrees: number; quality: FaceQuality }> {
  const bounds = calculateFaceBounds(landmarks);
  const rollDegrees = calculateRollDegrees(landmarks);
  const alignedLandmarks = getAlignmentLandmarks(landmarks);
  const landmarksAccepted =
    landmarks.length >= faceCapture.minLandmarkCount &&
    Object.values(alignedLandmarks).every(Boolean);
  const faceInFrameAccepted =
    bounds.minX >= 0 && bounds.minY >= 0 && bounds.maxX <= 1 && bounds.maxY <= 1;
  const faceSizeAccepted =
    bounds.width >= faceCapture.minFaceWidthRatio &&
    bounds.height >= faceCapture.minFaceHeightRatio &&
    bounds.width * bounds.height >= faceCapture.minFaceAreaRatio;
  const rotationAccepted = Math.abs(rollDegrees) <= faceCapture.maxRollDegrees;
  const pixels = await analyzePixels(await decodeImage(sampleUri), bounds);
  const lightingAccepted =
    pixels.brightness !== null &&
    pixels.brightness >= faceCapture.minBrightness &&
    pixels.brightness <= faceCapture.maxBrightness;
  const sharpnessAccepted =
    pixels.sharpness !== null && pixels.sharpness >= faceCapture.minSharpness;

  const issues: FaceQualityIssue[] = [];
  if (!landmarksAccepted) issues.push('landmarks-incomplete');
  if (!faceInFrameAccepted) issues.push('face-out-of-frame');
  if (!faceSizeAccepted) issues.push('face-too-small');
  if (!rotationAccepted) issues.push('excessive-rotation');
  if (pixels.brightness !== null && pixels.brightness < faceCapture.minBrightness) {
    issues.push('insufficient-light');
  } else if (pixels.brightness !== null && pixels.brightness > faceCapture.maxBrightness) {
    issues.push('excessive-light');
  }
  if (!sharpnessAccepted) issues.push('blur-detected');
  if (!confidenceAccepted) issues.push('low-confidence');
  const reason: FaceQuality['reason'] = issues[0] ?? 'accepted';

  return {
    bounds,
    rollDegrees,
    quality: {
      accepted:
        landmarksAccepted &&
        faceInFrameAccepted &&
        faceSizeAccepted &&
        rotationAccepted &&
        lightingAccepted &&
        sharpnessAccepted &&
        confidenceAccepted,
      faceSizeAccepted,
      faceInFrameAccepted,
      landmarksAccepted,
      rotationAccepted,
      lightingAccepted,
      sharpnessAccepted,
      confidenceAccepted,
      brightness: pixels.brightness,
      sharpness: pixels.sharpness,
      rollDegrees,
      reason,
      issues,
    },
  };
}

export function createDetectedFace(
  id: number,
  landmarks: FaceLandmark[],
  bounds: FaceBounds,
  rollDegrees: number,
  quality: FaceQuality,
  boundingBox?: FaceBoundingBox,
): DetectedFace {
  return {
    id,
    landmarks,
    bounds,
    boundingBox: boundingBox ?? {
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.width,
      height: bounds.height,
      coordinateSpace: 'normalized',
    },
    rollDegrees,
    confidence: null,
    confidenceSource: 'mediapipe-threshold',
    quality,
  };
}