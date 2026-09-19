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

  try {
    const rotatedDims = rotatedDimensions(
      imageWidth,
      imageHeight,
      rotationDegrees,
    );
    const crop = calculateAlignmentCrop(
      face.landmarks,
      imageWidth,
      imageHeight,
      rotationDegrees,
      rotatedDims.width,
      rotatedDims.height,
      faceCapture,
      keyLandmarks,
    );
    const aligned = await manipulateAsync(
      sourceUri,
      [
        { rotate: rotationDegrees },
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
  }
}