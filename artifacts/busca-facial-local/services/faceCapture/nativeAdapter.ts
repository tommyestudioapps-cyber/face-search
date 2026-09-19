import { Platform } from 'react-native';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import { getNativeErrorDetails, mapNativeResult } from './nativeAdapterCore';
import type { NativeDetectionResult, NativeResultBundle } from './types';

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
    try {
      result = await detectWithDelegate(runtime, imagePath, Delegate.GPU);
    } catch (gpuError) {
      if (gpuError instanceof DetectionTimeoutError) {
        // O nativo ainda pode estar rodando em background; não
        // disparamos uma segunda detecção só para cair em CPU.
        throw gpuError;
      }
      if (__DEV__) {
        console.log('[FaceCapture] GPU delegate falhou, usando CPU', {
          error:
            gpuError instanceof Error ? gpuError.message : String(gpuError),
        });
      }
      result = await detectWithDelegate(runtime, imagePath, Delegate.CPU);
    }

    return mapNativeResult(result);
  } catch (error) {
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    throw mapNativeError(error);
  }
}