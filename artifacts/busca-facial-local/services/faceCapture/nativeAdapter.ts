import { Platform } from 'react-native';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import { getNativeErrorDetails, mapNativeResult } from './nativeAdapterCore';
import type { NativeDetectionResult, NativeResultBundle } from './types';

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

    return mapNativeResult(result);
  } catch (error) {
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    throw mapNativeError(error);
  }
}