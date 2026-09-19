import { Platform } from 'react-native';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import { getNativeErrorDetails, mapNativeResult } from './nativeAdapterCore';
import type { NativeDetectionResult, NativeResultBundle } from './types';

const NATIVE_DETECTION_TIMEOUT_MS = 30_000;

export type {
  NativeDetectedFace,
  NativeDetectionResult,
  NativeFaceResult,
  NativeResultBundle,
} from './types';

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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => FaceCaptureError,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(onTimeout());
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function mapNativeError(error: unknown): FaceCaptureError {
  const details = getNativeErrorDetails(error);
  return new FaceCaptureError(details.code, details.message);
}

export async function detectFacesWithMediaPipe(
  imagePath: string,
): Promise<NativeDetectionResult> {
  if (!imagePath) {
    throw new FaceCaptureError('invalid-image', 'O caminho da imagem temporária está vazio.');
  }

  const runtime = getRuntime();

  try {
    const result = await withTimeout(
      runtime.faceLandmarkDetectionOnImage(
        imagePath,
        faceCapture.modelAssetName,
        {
          numFaces: faceCapture.maxFaces,
          minFaceDetectionConfidence: faceCapture.minDetectionConfidence,
          minFacePresenceConfidence: faceCapture.minPresenceConfidence,
          minTrackingConfidence: faceCapture.minTrackingConfidence,
          delegate: 0,
        },
      ),
      NATIVE_DETECTION_TIMEOUT_MS,
      () =>
        new FaceCaptureError(
          'processing-failed',
          'A detecção facial demorou demais para responder.',
        ),
    );

    return mapNativeResult(result);
  } catch (error) {
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    throw mapNativeError(error);
  }
}