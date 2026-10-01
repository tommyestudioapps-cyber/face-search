import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { faceSearch } from '@/constants/faceSearch';
import { sha256Hex } from './sha256';

declare const require: (moduleName: string) => number;

export interface RecognitionModelIdentity {
  sha256: string;
  modelVersion: string;
  pipelineVersion: string;
}

let identityPromise: Promise<RecognitionModelIdentity> | null = null;

export function getRecognitionModelIdentity(): Promise<RecognitionModelIdentity> {
  if (!identityPromise) {
    identityPromise = (async () => {
      const asset = Asset.fromModule(
        require('../../assets/models/face-recognition.tflite'),
      );
      await asset.downloadAsync();
      if (!asset.localUri) {
        throw new Error('O arquivo local do modelo facial não está disponível.');
      }

      const bytes = await new File(asset.localUri).bytes();
      return {
        sha256: sha256Hex(bytes),
        modelVersion: faceSearch.modelVersion,
        pipelineVersion: faceSearch.pipelineVersion,
      };
    })().catch((error) => {
      identityPromise = null;
      throw error;
    });
  }

  return identityPromise;
}