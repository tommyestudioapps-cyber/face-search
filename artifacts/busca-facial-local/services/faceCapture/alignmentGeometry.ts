import { FaceCaptureError, type FaceLandmark } from './types';

const TEMPLATE_SIZE = 112;
const TEMPLATE_LEFT_EYE = { x: 38.2946, y: 51.6963 };
const TEMPLATE_RIGHT_EYE = { x: 73.5318, y: 51.5014 };

const TEMPLATE_EYE_DISTANCE = Math.hypot(
  TEMPLATE_RIGHT_EYE.x - TEMPLATE_LEFT_EYE.x,
  TEMPLATE_RIGHT_EYE.y - TEMPLATE_LEFT_EYE.y,
);
const TEMPLATE_EYE_CENTER_X =
  (TEMPLATE_LEFT_EYE.x + TEMPLATE_RIGHT_EYE.x) / 2;
const TEMPLATE_EYE_CENTER_Y =
  (TEMPLATE_LEFT_EYE.y + TEMPLATE_RIGHT_EYE.y) / 2;
const TEMPLATE_EYE_CENTER_X_RATIO = TEMPLATE_EYE_CENTER_X / TEMPLATE_SIZE;
const TEMPLATE_EYE_CENTER_Y_RATIO = TEMPLATE_EYE_CENTER_Y / TEMPLATE_SIZE;

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
 * Calculates a square crop using the ArcFace/InsightFace 112x112 template.
 * Only the eyes are used as the alignment anchor.
 */
export function calculateAlignmentCrop(
  leftEye: FaceLandmark,
  rightEye: FaceLandmark,
  imageWidth: number,
  imageHeight: number,
  rotationDegrees: number,
  rotatedWidth: number,
  rotatedHeight: number,
): AlignmentCrop {
  const transformedLeftEye = transformPointForRotation(
    { x: leftEye.x * imageWidth, y: leftEye.y * imageHeight },
    imageWidth,
    imageHeight,
    rotatedWidth,
    rotatedHeight,
    rotationDegrees,
  );
  const transformedRightEye = transformPointForRotation(
    { x: rightEye.x * imageWidth, y: rightEye.y * imageHeight },
    imageWidth,
    imageHeight,
    rotatedWidth,
    rotatedHeight,
    rotationDegrees,
  );

  const eyeDistance = Math.hypot(
    transformedRightEye.x - transformedLeftEye.x,
    transformedRightEye.y - transformedLeftEye.y,
  );
  if (!Number.isFinite(eyeDistance) || eyeDistance <= 0) {
    throw new FaceCaptureError(
      'landmarks-incomplete',
      'Não foi possível calcular o recorte porque os olhos não puderam ser medidos.',
    );
  }

  const eyeCenterX = (transformedLeftEye.x + transformedRightEye.x) / 2;
  const eyeCenterY = (transformedLeftEye.y + transformedRightEye.y) / 2;

  const desiredSide = (eyeDistance * TEMPLATE_SIZE) / TEMPLATE_EYE_DISTANCE;
  const maxSide = Math.min(rotatedWidth, rotatedHeight);
  const cropSide = Math.max(1, Math.floor(Math.min(desiredSide, maxSide)));

  const originX = Math.floor(
    clamp(
      eyeCenterX - TEMPLATE_EYE_CENTER_X_RATIO * cropSide,
      0,
      rotatedWidth - cropSide,
    ),
  );
  const originY = Math.floor(
    clamp(
      eyeCenterY - TEMPLATE_EYE_CENTER_Y_RATIO * cropSide,
      0,
      rotatedHeight - cropSide,
    ),
  );

  return {
    originX,
    originY,
    width: cropSide,
    height: cropSide,
  };
}