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

/** Resolve o arquivo do modelo empacotado no APK para um caminho local legível. */
export async function resolveModelLocalUri(): Promise<string> {
  const asset = Asset.fromModule(
    require('../../assets/models/face-recognition.tflite'),
  );
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error('O arquivo local do modelo facial não está disponível.');
  }
  return asset.localUri;
}

/** Lê o modelo inteiro e calcula o SHA-256 em JS puro. Custo alto: ~7-8 s. */
export async function computeRecognitionModelIdentity(
  localUri: string,
): Promise<RecognitionModelIdentity> {
  const bytes = await new File(localUri).bytes();
  return {
    sha256: sha256Hex(bytes),
    modelVersion: faceSearch.modelVersion,
    pipelineVersion: faceSearch.pipelineVersion,
  };
}

let identityPromise: Promise<RecognitionModelIdentity> | null = null;

/**
 * @deprecated Use getCachedRecognitionModelIdentity() de './modelIdentityCache'.
 * Mantido apenas para compatibilidade; recalcula o hash em todo cold start.
 */
export function getRecognitionModelIdentity(): Promise<RecognitionModelIdentity> {
  if (!identityPromise) {
    identityPromise = (async () => {
      const localUri = await resolveModelLocalUri();
      return computeRecognitionModelIdentity(localUri);
    })().catch((error) => {
      identityPromise = null;
      throw error;
    });
  }
  return identityPromise;
}
