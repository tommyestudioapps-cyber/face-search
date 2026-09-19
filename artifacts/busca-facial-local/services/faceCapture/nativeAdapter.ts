import { Platform } from 'react-native';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import { getNativeErrorDetails, mapNativeResult } from './nativeAdapterCore';
import type { NativeDetectionResult, NativeResultBundle } from './types';
import { logDelegateAttempt } from '../observability/logger';

const NATIVE_DETECTION_TIMEOUT_MS = 30_000;

const Delegate = {
  CPU: 0,
  GPU: 1,
} as const;

type DelegateValue = (typeof Delegate)[keyof typeof Delegate];

class DetectionTimeoutError extends FaceCaptureError {
  constructor() {
    super(
      'processing-failed',
      'A detecção facial demorou demais para responder.',
    );
  }
}

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
      delegate: DelegateValue;
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

async function detectWithDelegate(
  runtime: NativeMediaPipeRuntime,
  imagePath: string,
  delegate: DelegateValue,
): Promise<NativeResultBundle> {
  return withTimeout(
    runtime.faceLandmarkDetectionOnImage(
      imagePath,
      faceCapture.modelAssetName,
      {
        numFaces: faceCapture.maxFaces,
        minFaceDetectionConfidence: faceCapture.minDetectionConfidence,
        minFacePresenceConfidence: faceCapture.minPresenceConfidence,
        minTrackingConfidence: faceCapture.minTrackingConfidence,
        delegate,
      },
    ),
    NATIVE_DETECTION_TIMEOUT_MS,
    () => new DetectionTimeoutError(),
  );
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
    let result: NativeResultBundle;
    const preferred = faceCapture.preferredDelegate;
    const primaryDelegate = preferred === 'CPU' ? Delegate.CPU : Delegate.GPU;
    const fallbackDelegate = preferred === 'CPU' ? Delegate.GPU : Delegate.CPU;

    const primaryStart = Date.now();
    try {
      result = await detectWithDelegate(runtime, imagePath, primaryDelegate);
      logDelegateAttempt(preferred, Date.now() - primaryStart, true);
    } catch (primaryError) {
      logDelegateAttempt(preferred, Date.now() - primaryStart, false);
      if (primaryError instanceof DetectionTimeoutError) {
        throw primaryError;
      }
      if (__DEV__) {
        console.log(
          `[FaceCapture] ${preferred} falhou, tentando ${preferred === 'CPU' ? 'GPU' : 'CPU'}`,
          {
            error:
              primaryError instanceof Error
                ? primaryError.message
                : String(primaryError),
          },
        );
      }
      const fallback = preferred === 'CPU' ? 'GPU' : 'CPU';
      const fallbackStart = Date.now();
      result = await detectWithDelegate(runtime, imagePath, fallbackDelegate);
      logDelegateAttempt(fallback, Date.now() - fallbackStart, true);
    }

    return mapNativeResult(result);
  } catch (error) {
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    throw mapNativeError(error);
  }
}