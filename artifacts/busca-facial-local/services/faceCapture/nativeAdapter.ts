import { Platform } from 'react-native';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import type { FaceBoundingBox, FaceLandmark } from './types';

interface NativeFaceResult {
  faceLandmarks?: FaceLandmark[][];
}

interface NativeResultBundle {
  results?: NativeFaceResult[];
  inputImageHeight?: number;
  inputImageWidth?: number;
  inferenceTime?: number;
}

export interface NativeDetectedFace {
  landmarks: FaceLandmark[];
  boundingBox: FaceBoundingBox;
}

export interface NativeDetectionResult {
  faces: NativeDetectedFace[];
  inputImageHeight: number | null;
  inputImageWidth: number | null;
  inferenceTime: number | null;
}

interface NativeMediaPipeRuntime {
  faceLandmarkDetectionOnImage: (
    imagePath: string,
    model: string,
    options: {
      numFaces: number;
      minFaceDetectionConfidence: number;
      minFacePresenceConfidence: number;
      minTrackingConfidence: number;
      delegate: number;
    },
  ) => Promise<NativeResultBundle>;
}

declare const require: (moduleName: string) => unknown;

function getRuntime(): NativeMediaPipeRuntime {
  if (Platform.OS === 'web') {
    throw new FaceCaptureError(
      'web-unsupported',
      'A captura facial real está disponível somente no APK.',
    );
  }

  try {
    return require('react-native-mediapipe') as NativeMediaPipeRuntime;
  } catch {
    throw new FaceCaptureError(
      'native-module-unavailable',
      'O módulo nativo de captura facial não está disponível neste APK.',
    );
  }
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

function mapNativeError(error: unknown): FaceCaptureError {
  const message = error instanceof Error ? error.message : '';
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('model') ||
    normalizedMessage.includes('task') ||
    normalizedMessage.includes('asset')
  ) {
    return new FaceCaptureError(
      'model-unavailable',
      'O modelo facial local não foi encontrado no APK.',
    );
  }

  if (
    normalizedMessage.includes('image') ||
    normalizedMessage.includes('bitmap') ||
    normalizedMessage.includes('decode') ||
    normalizedMessage.includes('path')
  ) {
    return new FaceCaptureError(
      'invalid-image',
      'O arquivo temporário não pôde ser lido pelo detector facial.',
    );
  }

  if (
    normalizedMessage.includes('native') ||
    normalizedMessage.includes('visioncamera') ||
    normalizedMessage.includes('not available')
  ) {
    return new FaceCaptureError(
      'native-module-unavailable',
      'O módulo nativo de captura facial não está disponível neste APK.',
    );
  }

  return new FaceCaptureError(
    'processing-failed',
    'O detector facial não conseguiu processar esta imagem.',
  );
}

export async function detectFacesWithMediaPipe(
  imagePath: string,
): Promise<NativeDetectionResult> {
  if (!imagePath) {
    throw new FaceCaptureError('invalid-image', 'O caminho da imagem temporária está vazio.');
  }

  const runtime = getRuntime();

  try {
    const result = await runtime.faceLandmarkDetectionOnImage(
      imagePath,
      faceCapture.modelAssetName,
      {
        numFaces: faceCapture.maxFaces,
        minFaceDetectionConfidence: faceCapture.minDetectionConfidence,
        minFacePresenceConfidence: faceCapture.minPresenceConfidence,
        minTrackingConfidence: faceCapture.minTrackingConfidence,
        delegate: 0,
      },
    );

    const faces = (result.results ?? []).flatMap((frame) =>
      (frame.faceLandmarks ?? []).map((landmarks) => ({
        landmarks,
        boundingBox: toBoundingBox(landmarks),
      })),
    );

    return {
      faces,
      inputImageHeight: result.inputImageHeight ?? null,
      inputImageWidth: result.inputImageWidth ?? null,
      inferenceTime: result.inferenceTime ?? null,
    };
  } catch (error) {
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    throw mapNativeError(error);
  }
}