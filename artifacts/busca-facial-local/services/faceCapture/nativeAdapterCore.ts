import type {
  FaceBoundingBox,
  FaceCaptureErrorCode,
  FaceLandmark,
  NativeDetectionResult,
  NativeResultBundle,
} from './types';

export interface NativeErrorDetails {
  code: FaceCaptureErrorCode;
  message: string;
}

function toBoundingBox(landmarks: FaceLandmark[]): FaceBoundingBox {
  if (landmarks.length === 0) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      coordinateSpace: 'normalized',
    };
  }

  const minX = Math.min(...landmarks.map((landmark) => landmark.x));
  const minY = Math.min(...landmarks.map((landmark) => landmark.y));
  const maxX = Math.max(...landmarks.map((landmark) => landmark.x));
  const maxY = Math.max(...landmarks.map((landmark) => landmark.y));

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    coordinateSpace: 'normalized',
  };
}

/**
 * MediaPipe returns one result per processed frame, with all faces for that
 * frame nested in `faceLandmarks`. Keep the face boundary tied to its own
 * landmarks while flattening the frame wrappers.
 */
export function mapNativeResult(result: NativeResultBundle): NativeDetectionResult {
  const faces = (result.results ?? [])
    .flatMap((frame) => frame.faceLandmarks ?? [])
    .map((landmarks) => ({
      landmarks,
      boundingBox: toBoundingBox(landmarks),
    }));

  return {
    faces,
    inputImageHeight: result.inputImageHeight ?? null,
    inputImageWidth: result.inputImageWidth ?? null,
    inferenceTime: result.inferenceTime ?? null,
  };
}

export function getNativeErrorDetails(error: unknown): NativeErrorDetails {
  const message = error instanceof Error ? error.message : '';
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('model') ||
    normalizedMessage.includes('task') ||
    normalizedMessage.includes('asset')
  ) {
    return {
      code: 'model-unavailable',
      message: 'O modelo facial local não foi encontrado no APK.',
    };
  }

  if (
    normalizedMessage.includes('image') ||
    normalizedMessage.includes('bitmap') ||
    normalizedMessage.includes('decode') ||
    normalizedMessage.includes('path')
  ) {
    return {
      code: 'invalid-image',
      message: 'O arquivo temporário não pôde ser lido pelo detector facial.',
    };
  }

  if (
    normalizedMessage.includes('native') ||
    normalizedMessage.includes('visioncamera') ||
    normalizedMessage.includes('not available')
  ) {
    return {
      code: 'native-module-unavailable',
      message: 'O módulo nativo de captura facial não está disponível neste APK.',
    };
  }

  return {
    code: 'processing-failed',
    message: 'O detector facial não conseguiu processar esta imagem.',
  };
}