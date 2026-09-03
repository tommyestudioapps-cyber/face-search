import { Platform } from 'react-native';
import { faceCapture } from '@/constants/faceCapture';
import { FaceCaptureError } from './types';
import type { FaceLandmark } from './types';

interface NativeFaceResult {
  faceLandmarks?: Array<Array<FaceLandmark>>;
}

interface NativeResultBundle {
  results?: NativeFaceResult[];
  inputImageHeight?: number;
  inputImageWidth?: number;
  inferenceTime?: number;
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

export async function detectFacesWithMediaPipe(
  imagePath: string,
): Promise<NativeResultBundle> {
  const runtime = getRuntime();

  try {
    return await runtime.faceLandmarkDetectionOnImage(
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
  } catch (error) {
    if (error instanceof FaceCaptureError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Falha no MediaPipe.';
    const code = message.toLowerCase().includes('model')
      ? 'model-unavailable'
      : 'processing-failed';
    throw new FaceCaptureError(code, message);
  }
}