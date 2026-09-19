import { FaceCaptureError, type FaceLandmark } from './types';

export interface AlignmentLandmarks {
  leftEye: FaceLandmark | null;
  rightEye: FaceLandmark | null;
  nose: FaceLandmark | null;
  mouth: FaceLandmark | null;
}

export interface AlignmentCrop {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface AlignmentCropConfig {
  cropWidthMultiplier: number;
  cropHeightMultiplier: number;
  targetEyeDistanceRatio: number;
  cropPaddingRatio: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function transformPointForRotation(
  point: { x: number; y: number },
  width: number,
  height: number,
  outputWidth: number,
  outputHeight: number,
  degrees: number,
) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = width / 2;
  const centerY = height / 2;
  return {
    x: cos * (point.x - centerX) - sin * (point.y - centerY) + outputWidth / 2,
    y: sin * (point.x - centerX) + cos * (point.y - centerY) + outputHeight / 2,
  };
}

export function rotatedDimensions(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: Math.max(1, Math.round(width * cos + height * sin)),
    height: Math.max(1, Math.round(width * sin + height * cos)),
  };
}

/**
 * Calculates the square crop after the face has been leveled. The anchor is
 * intentionally based on eyes, nose and mouth rather than the raw landmark
 * bounding-box center, which stays stable when a face is tilted or close to
 * one edge of the image.
 */
export function calculateAlignmentCrop(
  landmarks: FaceLandmark[],
  imageWidth: number,
  imageHeight: number,
  rotationDegrees: number,
  rotatedWidth: number,
  rotatedHeight: number,
  config: AlignmentCropConfig,
  keyLandmarks: AlignmentLandmarks,
): AlignmentCrop {
  const points = landmarks
    .filter(
      (point): point is FaceLandmark =>
        point !== null &&
        point !== undefined &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Number.isFinite(point.z),
    )
    .map((point) =>
      transformPointForRotation(
        { x: point.x * imageWidth, y: point.y * imageHeight },
        imageWidth,
        imageHeight,
        rotatedWidth,
        rotatedHeight,
        rotationDegrees,
      ),
    );
  if (points.length === 0) {
    throw new FaceCaptureError(
      'landmarks-incomplete',
      'Não foi possível calcular o recorte porque os pontos do rosto estão incompletos.',
    );
  }
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const faceWidth = Math.max(1, maxX - minX);
  const faceHeight = Math.max(1, maxY - minY);
  const transformedKeyLandmarks = {
    leftEye: keyLandmarks.leftEye
      ? transformPointForRotation(
          { x: keyLandmarks.leftEye.x * imageWidth, y: keyLandmarks.leftEye.y * imageHeight },
          imageWidth,
          imageHeight,
          rotatedWidth,
          rotatedHeight,
          rotationDegrees,
        )
      : null,
    rightEye: keyLandmarks.rightEye
      ? transformPointForRotation(
          { x: keyLandmarks.rightEye.x * imageWidth, y: keyLandmarks.rightEye.y * imageHeight },
          imageWidth,
          imageHeight,
          rotatedWidth,
          rotatedHeight,
          rotationDegrees,
        )
      : null,
    nose: keyLandmarks.nose
      ? transformPointForRotation(
          { x: keyLandmarks.nose.x * imageWidth, y: keyLandmarks.nose.y * imageHeight },
          imageWidth,
          imageHeight,
          rotatedWidth,
          rotatedHeight,
          rotationDegrees,
        )
      : null,
    mouth: keyLandmarks.mouth
      ? transformPointForRotation(
          { x: keyLandmarks.mouth.x * imageWidth, y: keyLandmarks.mouth.y * imageHeight },
          imageWidth,
          imageHeight,
          rotatedWidth,
          rotatedHeight,
          rotationDegrees,
        )
      : null,
  };
  const eyeDistance =
    transformedKeyLandmarks.leftEye && transformedKeyLandmarks.rightEye
      ? Math.hypot(
          transformedKeyLandmarks.rightEye.x - transformedKeyLandmarks.leftEye.x,
          transformedKeyLandmarks.rightEye.y - transformedKeyLandmarks.leftEye.y,
        )
      : 0;
  const anchorPoints = [
    transformedKeyLandmarks.leftEye && transformedKeyLandmarks.rightEye
      ? {
          x: (transformedKeyLandmarks.leftEye.x + transformedKeyLandmarks.rightEye.x) / 2,
          y: (transformedKeyLandmarks.leftEye.y + transformedKeyLandmarks.rightEye.y) / 2,
          weight: 0.35,
        }
      : null,
    transformedKeyLandmarks.nose
      ? { ...transformedKeyLandmarks.nose, weight: 0.4 }
      : null,
    transformedKeyLandmarks.mouth
      ? { ...transformedKeyLandmarks.mouth, weight: 0.25 }
      : null,
  ].filter((point): point is { x: number; y: number; weight: number } => point !== null);
  const anchorWeight = anchorPoints.reduce((sum, point) => sum + point.weight, 0);
  const anchor = anchorWeight
    ? {
        x: anchorPoints.reduce((sum, point) => sum + point.x * point.weight, 0) / anchorWeight,
        y: anchorPoints.reduce((sum, point) => sum + point.y * point.weight, 0) / anchorWeight,
      }
    : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const maxSide = Math.min(rotatedWidth, rotatedHeight);
  const side = clamp(
    Math.max(
      faceWidth * config.cropWidthMultiplier,
      faceHeight * config.cropHeightMultiplier,
      eyeDistance / config.targetEyeDistanceRatio,
      Math.max(faceWidth, faceHeight) * (1 + config.cropPaddingRatio * 2),
    ),
    1,
    maxSide,
  );
  // Quantize the crop once, after clamping its size. Using the same integer
  // side for both axes prevents a one-pixel skew at image edges.
  const cropSide = Math.max(1, Math.floor(side));
  const originX = Math.floor(
    clamp(anchor.x - cropSide / 2, 0, rotatedWidth - cropSide),
  );
  const originY = Math.floor(
    clamp(anchor.y - cropSide / 2, 0, rotatedHeight - cropSide),
  );

  return {
    originX,
    originY,
    width: cropSide,
    height: cropSide,
  };
}