import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import type { AlignedFace, DetectedFace, FaceLandmark } from './types';
import { getAlignmentLandmarks } from './quality';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rotatePoint(
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

function rotatedDimensions(width: number, height: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: Math.max(1, Math.round(width * cos + height * sin)),
    height: Math.max(1, Math.round(width * sin + height * cos)),
  };
}

function getCrop(
  face: DetectedFace,
  landmarks: FaceLandmark[],
  imageWidth: number,
  imageHeight: number,
  rotationDegrees: number,
  rotatedWidth: number,
  rotatedHeight: number,
) {
  const points = landmarks.map((point) =>
    rotatePoint(
      { x: point.x * imageWidth, y: point.y * imageHeight },
      imageWidth,
      imageHeight,
      rotatedWidth,
      rotatedHeight,
      rotationDegrees,
    ),
  );
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const faceWidth = Math.max(1, maxX - minX);
  const faceHeight = Math.max(1, maxY - minY);
  const maxSide = Math.min(rotatedWidth, rotatedHeight);
  const side = clamp(
    Math.max(
      faceWidth * faceCapture.cropWidthMultiplier,
      faceHeight * faceCapture.cropHeightMultiplier,
    ),
    1,
    maxSide,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const originX = clamp(centerX - side / 2, 0, rotatedWidth - side);
  const originY = clamp(centerY - side / 2, 0, rotatedHeight - side);

  return {
    originX: Math.floor(originX),
    originY: Math.floor(originY),
    width: Math.max(1, Math.floor(Math.min(side, rotatedWidth - Math.floor(originX)))),
    height: Math.max(1, Math.floor(Math.min(side, rotatedHeight - Math.floor(originY)))),
  };
}

export async function alignFace(
  sourceUri: string,
  imageWidth: number,
  imageHeight: number,
  face: DetectedFace,
): Promise<AlignedFace> {
  const { leftEye, rightEye } = getAlignmentLandmarks(face.landmarks);
  if (!leftEye || !rightEye) {
    throw new FaceCaptureError(
      'quality-rejected',
      'Não foi possível alinhar os pontos principais do rosto.',
    );
  }

  const rotationDegrees = -face.rollDegrees;
  let rotatedUri: string | null = null;

  try {
    const rotated = await manipulateAsync(
      sourceUri,
      [{ rotate: rotationDegrees }],
      {
        compress: 0.92,
        format: SaveFormat.JPEG,
      },
    );
    rotatedUri = rotated.uri;
    const dimensions =
      rotated.width > 0 && rotated.height > 0
        ? { width: rotated.width, height: rotated.height }
        : rotatedDimensions(imageWidth, imageHeight, rotationDegrees);
    const crop = getCrop(
      face,
      face.landmarks,
      imageWidth,
      imageHeight,
      rotationDegrees,
      dimensions.width,
      dimensions.height,
    );
    const aligned = await manipulateAsync(
      rotated.uri,
      [
        { crop },
        {
          resize: {
            width: faceCapture.alignedFaceSize,
            height: faceCapture.alignedFaceSize,
          },
        },
      ],
      {
        compress: 0.94,
        format: SaveFormat.JPEG,
      },
    );

    return {
      uri: aligned.uri,
      width: aligned.width,
      height: aligned.height,
      faceId: face.id,
      rotationDegrees,
      crop,
    };
  } catch (error) {
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Falha ao alinhar o rosto.';
    throw new FaceCaptureError('processing-failed', message);
  } finally {
    if (rotatedUri && rotatedUri !== sourceUri) {
      try {
        const { File } = await import('expo-file-system');
        new File(rotatedUri).delete();
      } catch {
        // Temporary cleanup is best-effort; the source image is never deleted.
      }
    }
  }
}