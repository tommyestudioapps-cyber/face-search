import {
  FlipType,
  manipulateAsync,
  SaveFormat,
} from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { FaceCaptureError, NormalizedImage } from './types';
import { FaceCaptureError as FaceCaptureFailure } from './types';
import { faceCapture } from '@/constants/faceCapture';
import {
  getExifTransform,
  getNormalizedImageDimensions,
  getPhysicalOrientation,
  readJpegMetadata,
} from './preprocessingGeometry';

async function readSourceJpegMetadata(sourceUri: string) {
  try {
    const bytes = await new File(sourceUri).bytes();
    return readJpegMetadata(bytes);
  } catch {
    // Android content:// providers may not expose bytes to JavaScript. The
    // image manipulator still performs the native EXIF normalization.
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
    const exifTransform = getExifTransform(exifOrientation);
    const transformActions = [
      ...exifTransform.flips.map((flip) => ({
        flip:
          flip === 'horizontal' ? FlipType.Horizontal : FlipType.Vertical,
      })),
      ...(exifTransform.rotationDegrees
        ? [{ rotate: exifTransform.rotationDegrees }]
        : []),
    ];

    // Always render a new bitmap. This bakes EXIF rotation and mirroring into
    // pixels before MediaPipe sees them, including Android camera/gallery
    // providers that expose content:// URIs with inconsistent EXIF handling.
    const oriented = await manipulateAsync(
      sourceUri,
      transformActions.length > 0 ? transformActions : [{ rotate: 0 }],
      {
      compress: 0.92,
      format: SaveFormat.JPEG,
      },
    );
    if (__DEV__) {
      console.log('[FaceCapture] EXIF orientation applied', {
        platform: Platform.OS,
        exifOrientation,
        rotationDegrees: exifTransform.rotationDegrees,
        flips: exifTransform.flips,
      });
    }
    if (oriented.width <= 0 || oriented.height <= 0) {
      throw new FaceCaptureFailure('invalid-image', 'A imagem normalizada não possui dimensões válidas.');
    }
    if (sourceMetadata) {
      const expectedDimensions = getNormalizedImageDimensions(
        sourceMetadata.width,
        sourceMetadata.height,
        sourceMetadata.orientation,
      );
      if (
        oriented.width !== expectedDimensions.width ||
        oriented.height !== expectedDimensions.height
      ) {
        throw new FaceCaptureFailure(
          'invalid-image',
          'A orientação da imagem não pôde ser normalizada com segurança.',
        );
      }
    }
    const temporaryUris = [oriented.uri];

    const largestDimension = Math.max(oriented.width, oriented.height);
    if (largestDimension <= faceCapture.maxInputDimension) {
      if (__DEV__) {
        console.log(
          `[Normalize] ${oriented.width}x${oriented.height} mantida (abaixo do limite)`,
        );
      }
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