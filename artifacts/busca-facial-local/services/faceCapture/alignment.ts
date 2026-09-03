import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import type { AlignedFace, DetectedFace } from './types';
import { getAlignmentLandmarks } from './landmarkGeometry';
import { calculateAlignmentCrop, rotatedDimensions } from './alignmentGeometry';

export async function alignFace(
  sourceUri: string,
  imageWidth: number,
  imageHeight: number,
  face: DetectedFace,
): Promise<AlignedFace> {
  const keyLandmarks = getAlignmentLandmarks(face.landmarks);
  const { leftEye, rightEye } = keyLandmarks;
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
    const crop = calculateAlignmentCrop(
      face.landmarks,
      imageWidth,
      imageHeight,
      rotationDegrees,
      dimensions.width,
      dimensions.height,
      faceCapture,
      keyLandmarks,
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
      standardized: true,
      sourceUri,
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