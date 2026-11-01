import {
  manipulateAsync,
  SaveFormat,
} from 'expo-image-manipulator';
import { Image, Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { FaceCaptureError, NormalizedImage } from './types';
import { FaceCaptureError as FaceCaptureFailure } from './types';
import { faceCapture } from '@/constants/faceCapture';
import {
  getNormalizedImageDimensions,
  getPhysicalOrientation,
  readJpegMetadata,
} from './preprocessingGeometry';

async function readSourceJpegMetadata(sourceUri: string) {
  try {
    const file = new File(sourceUri);
    if (typeof file.size === 'number' && file.size > 1_500_000) {
      return null;
    }
    const bytes = await file.bytes();
    return readJpegMetadata(bytes);
  } catch (error) {
    // Android content:// providers may not expose bytes to JavaScript. The
    // image manipulator still performs the native EXIF normalization.
    const detail = error instanceof Error ? ` Detalhe: ${error.message}` : '';
    console.warn(
      `[EXIF:Error] Falha ao ler bytes do URI: ${sourceUri}.${detail} Forçando orientação padrão 1.`,
    );
    return null;
  }
}

function getImageSizeAsync(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

export async function normalizeImage(sourceUri: string): Promise<NormalizedImage> {
  if (!sourceUri) {
    throw new FaceCaptureFailure('invalid-image', 'A imagem selecionada é inválida.');
  }

  try {
    const sourceMetadata = await readSourceJpegMetadata(sourceUri);
    const exifOrientation = sourceMetadata?.orientation ?? 1;
    console.warn('[EXIF:Read] status=' + (sourceMetadata ? 'ok' : 'fail') + ' orientation=' + exifOrientation + ' uri=' + sourceUri.slice(0, 100));

    let raw = sourceMetadata ? { width: sourceMetadata.width, height: sourceMetadata.height } : null;
    if (!raw) {
      raw = await getImageSizeAsync(sourceUri);
    }

    const expected = getNormalizedImageDimensions(raw.width, raw.height, exifOrientation);
    const scale = Math.min(1, faceCapture.maxInputDimension / Math.max(expected.width, expected.height));
    const targetWidth = Math.round(expected.width * scale);
    const targetHeight = Math.round(expected.height * scale);

    const out = await manipulateAsync(
      sourceUri,
      scale < 1
        ? [{ rotate: 0 }, { resize: { width: targetWidth, height: targetHeight } }]
        : [{ rotate: 0 }],
      {
        compress: 0.85,
        format: SaveFormat.JPEG,
      },
    );

    if (Math.abs(out.width - targetWidth) > 2 || Math.abs(out.height - targetHeight) > 2) {
      throw new FaceCaptureFailure(
        'invalid-image',
        'A orientação da imagem não pôde ser normalizada com segurança.',
      );
    }

    const temporaryUris = [out.uri];
    console.warn('[Prep:Output] uri=' + sourceUri.slice(0, 100) + ' final=' + out.width + 'x' + out.height);

    return {
      uri: out.uri,
      width: out.width,
      height: out.height,
      orientation: getPhysicalOrientation(out.width, out.height),
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