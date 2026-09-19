import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { faceCapture } from '@/constants/faceCapture';
import {
  getSelectableFaces,
  runFaceCaptureFlow,
} from './captureFlow';
import { alignFace } from './alignment';
import { detectFacesWithMediaPipe } from './nativeAdapter';
import { createAnalysisSample, normalizeImage } from './preprocessing';
import { createDetectedFace, decodeImage, evaluateFaceQuality } from './quality';
import {
  FaceCaptureError,
  type AlignedFace,
  type DetectedFace,
  type FaceDetectionSession,
  type FaceLandmark,
} from './types';

export * from './types';
export { getSelectableFaces, runFaceCaptureFlow } from './captureFlow';

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
    const qualityImage = await decodeImage(qualitySample.uri);
    const detectStartedAt = Date.now();
    const result = await detectFacesWithMediaPipe(normalized.uri);
    if (__DEV__) {
      console.log(
        `[Detect] nativo ${Date.now() - detectStartedAt}ms | ` +
          `faces=${result.faces.length}`,
      );
    }
    const nativeFaces = result.faces;

    if (nativeFaces.length === 0) {
      throw new FaceCaptureError(
        'no-face',
        'Nenhum rosto foi encontrado na imagem selecionada.',
      );
    }

    const faces: DetectedFace[] = [];
    let rejectedCount = 0;
    const rejectionReasons: string[] = [];
    for (const [id, nativeFace] of nativeFaces.entries()) {
      const landmarks = nativeFace.landmarks as FaceLandmark[];
      const evaluated = await evaluateFaceQuality(
        qualityImage,
        normalized.width,
        normalized.height,
        landmarks,
      );
      if (!evaluated.quality.accepted) {
        rejectedCount += 1;
        rejectionReasons.push(evaluated.quality.reason);
      }
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

    if (__DEV__ && nativeFaces.length > 0) {
      console.log(
        `[Detection] nativo=${nativeFaces.length} aceitos=${faces.length} rejeitados=${rejectedCount}`,
      );
      if (rejectionReasons.length > 0) {
        console.log(
          `[Detection] motivos=${rejectionReasons.join(',')}`,
        );
      }
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
    await cleanupTempFiles([
      ...normalized.temporaryUris,
      ...(qualitySampleUri ? [qualitySampleUri] : []),
    ]);
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Falha ao detectar rostos.';
    throw new FaceCaptureError('processing-failed', message);
  } finally {
    if (qualitySampleUri) {
      await cleanupTempFiles([qualitySampleUri]);
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

function qualityIssueMessage(issue: FaceCaptureError['code']): string {
  switch (issue) {
    case 'face-too-small':
      return 'O rosto está muito pequeno na imagem.';
    case 'face-out-of-frame':
      return 'O rosto precisa estar completamente dentro do enquadramento.';
    case 'excessive-rotation':
      return 'Gire a imagem para deixar o rosto mais reto.';
    case 'insufficient-light':
      return 'A imagem está escura. Use uma foto com mais iluminação.';
    case 'excessive-light':
      return 'A imagem está clara demais. Evite luz direta no rosto.';
    case 'blur-detected':
      return 'A imagem está desfocada. Use uma foto mais nítida.';
    case 'landmarks-incomplete':
      return 'Não foi possível identificar todos os pontos principais do rosto.';
    default:
      return 'Nenhum rosto atende aos critérios de qualidade.';
  }
}

export function getFaceQualityError(faces: DetectedFace[]): FaceCaptureError {
  const issue = faces.flatMap((face) => face.quality.issues)[0];
  if (issue) {
    return new FaceCaptureError(issue, qualityIssueMessage(issue));
  }
  return new FaceCaptureError(
    'quality-rejected',
    'Nenhum rosto atende aos critérios de qualidade.',
  );
}

export async function releaseFaceDetectionSession(
  session: FaceDetectionSession | null,
): Promise<void> {
  if (!session) {
    return;
  }
  await cleanupTempFiles(session.temporaryUris);
}

export async function cleanupTempFiles(uris: string[]): Promise<void> {
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

/**
 * Backwards-compatible name for callers that release a detection session.
 * All temporary-file deletion is implemented by cleanupTempFiles.
 */
export async function releaseTemporaryUris(uris: string[]): Promise<void> {
  await cleanupTempFiles(uris);
}

export { faceCapture };