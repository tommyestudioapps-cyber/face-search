import {
  manipulateAsync,
  SaveFormat,
} from 'expo-image-manipulator';
import { Platform } from 'react-native';
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
    const bytes = await new File(sourceUri).bytes();
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

export async function normalizeImage(sourceUri: string): Promise<NormalizedImage> {
  if (!sourceUri) {
    throw new FaceCaptureFailure('invalid-image', 'A imagem selecionada é inválida.');
  }

  try {
    const sourceMetadata = await readSourceJpegMetadata(sourceUri);
    const exifOrientation = sourceMetadata?.orientation ?? 1;
    console.warn('[EXIF:Read] status=' + (sourceMetadata ? 'ok' : 'fail') + ' orientation=' + exifOrientation + ' uri=' + sourceUri.slice(0, 100));

    // Always render a new bitmap. This bakes EXIF rotation and mirroring into
    // pixels before MediaPipe sees them, including Android camera/gallery
    // providers that expose content:// URIs with inconsistent EXIF handling.
    const orientedInitial = await manipulateAsync(
      sourceUri,
      [{ rotate: 0 }],
      {
        compress: 0.92,
        format: SaveFormat.JPEG,
      },
    );
    if (__DEV__) {
      console.log('[FaceCapture] EXIF orientation applied', {
        platform: Platform.OS,
        exifOrientation,
      });
    }
    if (orientedInitial.width <= 0 || orientedInitial.height <= 0) {
      throw new FaceCaptureFailure('invalid-image', 'A imagem normalizada não possui dimensões válidas.');
    }
    if (sourceMetadata) {
      const expectedDimensions = getNormalizedImageDimensions(
        sourceMetadata.width,
        sourceMetadata.height,
        sourceMetadata.orientation,
      );
      if (
        orientedInitial.width !== expectedDimensions.width ||
        orientedInitial.height !== expectedDimensions.height
      ) {
        throw new FaceCaptureFailure(
          'invalid-image',
          'A orientação da imagem não pôde ser normalizada com segurança.',
        );
      }
    }

    const aspectRatio = orientedInitial.width / orientedInitial.height;
    const needsSquareCrop = aspectRatio > 1.4 || aspectRatio < (1 / 1.4);
    let oriented = orientedInitial;
    let squareCropTempUri: string | null = null;

    if (needsSquareCrop) {
      const cropSize = Math.min(orientedInitial.width, orientedInitial.height);
      let cropOriginX = 0;
      let cropOriginY = 0;
      if (orientedInitial.height > orientedInitial.width) {
        // Retrato alongado: recorta quadrado viés topo (rostos geralmente no terço superior)
        cropOriginX = Math.floor((orientedInitial.width - cropSize) / 2);
        cropOriginY = Math.floor((orientedInitial.height - cropSize) * 0.2);
      } else {
        // Paisagem alongada: recorta quadrado centralizado
        cropOriginX = Math.floor((orientedInitial.width - cropSize) / 2);
        cropOriginY = Math.floor((orientedInitial.height - cropSize) / 2);
      }
      const cropped = await manipulateAsync(
        orientedInitial.uri,
        [
          {
            crop: {
              originX: cropOriginX,
              originY: cropOriginY,
              width: cropSize,
              height: cropSize,
            },
          },
        ],
        {
          compress: 0.92,
          format: SaveFormat.JPEG,
        },
      );
      squareCropTempUri = cropped.uri;
      oriented = cropped;
      console.warn('[Prep:SquareCrop] from=' + orientedInitial.width + 'x' + orientedInitial.height + ' to=' + cropSize + 'x' + cropSize + ' origin=' + cropOriginX + ',' + cropOriginY);
    }

    console.warn('[Prep:Exif] uri=' + sourceUri.slice(0, 100) + ' dims=' + oriented.width + 'x' + oriented.height);
    const temporaryUris = squareCropTempUri
      ? [orientedInitial.uri, squareCropTempUri]
      : [oriented.uri];

    const largestDimension = Math.max(oriented.width, oriented.height);
    if (largestDimension <= faceCapture.maxInputDimension) {
      if (__DEV__) {
        console.log(
          `[Normalize] ${oriented.width}x${oriented.height} mantida (abaixo do limite)`,
        );
      }
      console.warn('[Prep:Output] uri=' + sourceUri.slice(0, 100) + ' final=' + oriented.width + 'x' + oriented.height);
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
    if (__DEV__) {
      console.log(
        `[Normalize] ${oriented.width}x${oriented.height} → ${resized.width}x${resized.height}`,
      );
    }

    temporaryUris.push(resized.uri);
    console.warn('[Prep:Output] uri=' + sourceUri.slice(0, 100) + ' final=' + resized.width + 'x' + resized.height);
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