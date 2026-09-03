import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { faceCapture } from '@/constants/faceCapture';
import { alignFace } from './alignment';
import { detectFacesWithMediaPipe } from './nativeAdapter';
import { createAnalysisSample, normalizeImage } from './preprocessing';
import { createDetectedFace, evaluateFaceQuality } from './quality';
import {
  FaceCaptureError,
  type AlignedFace,
  type DetectedFace,
  type FaceDetectionSession,
  type FaceLandmark,
} from './types';

export * from './types';

export async function detectFaces(sourceUri: string): Promise<FaceDetectionSession> {
  if (Platform.OS === 'web') {
    throw new FaceCaptureError(
      'web-unsupported',
      'A captura facial real está disponível somente no APK.',
    );
  }

  const normalized = await normalizeImage(sourceUri);
  let qualitySampleUri: string | null = null;

  try {
    const qualitySample = await createAnalysisSample(normalized.uri);
    qualitySampleUri = qualitySample.uri;
    const result = await detectFacesWithMediaPipe(normalized.uri);
    const nativeFaces = result.faces;

    if (nativeFaces.length === 0) {
      throw new FaceCaptureError(
        'no-face',
        'Nenhum rosto foi encontrado na imagem selecionada.',
      );
    }

    const faces: DetectedFace[] = [];
    for (const [id, nativeFace] of nativeFaces.entries()) {
      const landmarks = nativeFace.landmarks as FaceLandmark[];
      const evaluated = await evaluateFaceQuality(
        qualitySampleUri,
        normalized.width,
        normalized.height,
        landmarks,
        true,
      );
      faces.push(
        createDetectedFace(
          id,
          landmarks,
          evaluated.bounds,
          evaluated.rollDegrees,
          evaluated.quality,
          nativeFace.boundingBox,
        ),
      );
    }

    return {
      sourceUri,
      normalizedUri: normalized.uri,
      width: normalized.width,
      height: normalized.height,
      faces,
      temporaryUris: [...normalized.temporaryUris],
    };
  } catch (error) {
    await releaseTemporaryUris([...normalized.temporaryUris, ...(qualitySampleUri ? [qualitySampleUri] : [])]);
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Falha ao detectar rostos.';
    throw new FaceCaptureError('processing-failed', message);
  } finally {
    if (qualitySampleUri) {
      await releaseTemporaryUris([qualitySampleUri]);
    }
  }
}

export async function alignSelectedFace(
  session: FaceDetectionSession,
  faceId: number,
): Promise<AlignedFace> {
  const face = session.faces.find((candidate) => candidate.id === faceId);
  if (!face) {
    throw new FaceCaptureError('quality-rejected', 'O rosto selecionado não está disponível.');
  }
  if (!face.quality.accepted) {
    throw new FaceCaptureError(
      'quality-rejected',
      'A qualidade do rosto não é suficiente para continuar.',
    );
  }

  return alignFace(session.normalizedUri, session.width, session.height, face);
}

export function getSelectableFaces(faces: DetectedFace[]): DetectedFace[] {
  return faces.filter((face) => face.quality.accepted);
}

export async function releaseFaceDetectionSession(
  session: FaceDetectionSession | null,
): Promise<void> {
  if (!session) {
    return;
  }
  await releaseTemporaryUris(session.temporaryUris);
}

export async function releaseTemporaryUris(uris: string[]): Promise<void> {
  const uniqueUris = [...new Set(uris)].filter(Boolean);
  await Promise.all(
    uniqueUris.map(async (uri) => {
      try {
        new File(uri).delete();
      } catch {
        // Only files created by this pipeline are passed here.
      }
    }),
  );
}

export { faceCapture };