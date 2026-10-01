import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
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
  createDetectionWindowLayout,
  deduplicateWindowFaces,
  mapWindowFacesToImage,
  type WindowedFaceDetection,
} from './windowDetection';
import {
  FaceCaptureError,
  type AlignedFace,
  type DetectedFace,
  type FaceDetectionSession,
  type FaceLandmark,
} from './types';

export * from './types';
export { getSelectableFaces, runFaceCaptureFlow } from './captureFlow';

export async function detectFaces(
  sourceUri: string,
  assetId?: string,
): Promise<FaceDetectionSession> {
  if (Platform.OS === 'web') {
    throw new FaceCaptureError(
      'web-unsupported',
      'A captura facial real está disponível somente no APK.',
    );
  }

  const normalized = await normalizeImage(sourceUri);
  let qualitySampleUri: string | null = null;
  const detectionWindowUris: string[] = [];

  try {
    const qualitySample = await createAnalysisSample(normalized.uri);
    qualitySampleUri = qualitySample.uri;
    const qualityImage = await decodeImage(qualitySample.uri);
    const layout = createDetectionWindowLayout(normalized.width, normalized.height);
    const facesPerWindow: number[] = [];
    const windowedFaces: WindowedFaceDetection[] = [];

    for (const window of layout.windows) {
      let detectionUri = normalized.uri;
      if (layout.elongated) {
        const tile = await manipulateAsync(
          normalized.uri,
          [
            {
              crop: {
                originX: window.x,
                originY: window.y,
                width: window.width,
                height: window.height,
              },
            },
          ],
          {
            compress: 0.96,
            format: SaveFormat.JPEG,
          },
        );
        detectionWindowUris.push(tile.uri);
        detectionUri = tile.uri;
      }

      const detectStartedAt = Date.now();
      const result = await detectFacesWithMediaPipe(detectionUri);
      if (__DEV__) {
        console.log(
          `[Detect] window=${window.index} nativo ${Date.now() - detectStartedAt}ms | ` +
            `faces=${result.faces.length}`,
        );
      }
      facesPerWindow.push(result.faces.length);
      windowedFaces.push(
        ...mapWindowFacesToImage(
          result.faces,
          window,
          normalized.width,
          normalized.height,
        ),
      );
    }

    const nativeFaces = deduplicateWindowFaces(
      windowedFaces,
      normalized.width,
      normalized.height,
    );
    const imageRatio = Math.max(normalized.width, normalized.height) /
      Math.min(normalized.width, normalized.height);
    console.warn(
      `[Detect:agg] assetId=${assetId ?? 'reference'} width=${normalized.width} height=${normalized.height} ratio=${imageRatio.toFixed(3)} windows=${layout.windows.length} facesPerWindow=${facesPerWindow.join(',')} facesAfterDedup=${nativeFaces.length} coverage=${layout.coverage.toFixed(3)}`,
    );

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
      const quality = evaluated.quality;
      const formatNullable = (value: number | null): string =>
        value === null ? 'na' : value.toFixed(3);
      console.warn(
        `[Quality:agg] assetId=${assetId ?? 'reference'} face=${id} w=${(evaluated.bounds.width * normalized.width).toFixed(1)} h=${(evaluated.bounds.height * normalized.height).toFixed(1)} brightness=${formatNullable(quality.brightness)} sharpness=${formatNullable(quality.sharpness)} yaw=${formatNullable(quality.yawDegrees)} pitch=${formatNullable(quality.pitchDegrees)} roll=${quality.rollDegrees.toFixed(3)} accepted=${quality.accepted} issues=${quality.issues.length ? quality.issues.join(',') : 'none'}`,
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

    console.warn(`[Detect:agg] native=${nativeFaces.length} accepted=${faces.filter(f => f.quality.accepted).length} rejected=${rejectedCount}`);

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
    await cleanupTempFiles(normalized.temporaryUris);
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Falha ao detectar rostos.';
    throw new FaceCaptureError('processing-failed', message);
  } finally {
    await cleanupTempFiles([
      ...detectionWindowUris,
      ...(qualitySampleUri ? [qualitySampleUri] : []),
    ]);
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