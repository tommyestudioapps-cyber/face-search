import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { FaceCaptureError, NormalizedImage } from './types';
import { FaceCaptureError as FaceCaptureFailure } from './types';
import { faceCapture } from '@/constants/faceCapture';

function getPhysicalOrientation(width: number, height: number): NormalizedImage['orientation'] {
  return height >= width ? 'portrait' : 'landscape-left';
}

export async function normalizeImage(sourceUri: string): Promise<NormalizedImage> {
  if (!sourceUri) {
    throw new FaceCaptureFailure('invalid-image', 'A imagem selecionada é inválida.');
  }

  try {
    const oriented = await manipulateAsync(sourceUri, [], {
      compress: 0.92,
      format: SaveFormat.JPEG,
    });
    const temporaryUris = [oriented.uri];

    const largestDimension = Math.max(oriented.width, oriented.height);
    if (largestDimension <= faceCapture.maxInputDimension) {
      return {
        uri: oriented.uri,
        width: oriented.width,
        height: oriented.height,
        orientation: getPhysicalOrientation(oriented.width, oriented.height),
        temporaryUris,
      };
    }

    const scale = faceCapture.maxInputDimension / largestDimension;
    const resized = await manipulateAsync(
      oriented.uri,
      [
        {
          resize: {
            width: Math.max(1, Math.round(oriented.width * scale)),
            height: Math.max(1, Math.round(oriented.height * scale)),
          },
        },
      ],
      {
        compress: 0.92,
        format: SaveFormat.JPEG,
      },
    );

    temporaryUris.push(resized.uri);
    return {
      uri: resized.uri,
      width: resized.width,
      height: resized.height,
      orientation: getPhysicalOrientation(resized.width, resized.height),
      temporaryUris,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao preparar a imagem.';
    throw new FaceCaptureFailure('invalid-image', message);
  }
}

export async function createAnalysisSample(normalizedUri: string): Promise<NormalizedImage> {
  try {
    const sample = await manipulateAsync(
      normalizedUri,
      [{ resize: { width: faceCapture.qualitySampleDimension } }],
      {
        compress: 0.85,
        format: SaveFormat.JPEG,
      },
    );
    return {
      uri: sample.uri,
      width: sample.width,
      height: sample.height,
      orientation: getPhysicalOrientation(sample.width, sample.height),
      temporaryUris: [sample.uri],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao preparar a amostra.';
    throw new FaceCaptureFailure('invalid-image', message);
  }
}

export function isFaceCaptureError(error: unknown): error is FaceCaptureError {
  return error instanceof FaceCaptureFailure;
}