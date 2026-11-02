import { File } from 'expo-file-system';
import { faceSearch } from '@/constants/faceSearch';
import { faceSearchRepository } from './repository';
import {
  computeRecognitionModelIdentity,
  resolveModelLocalUri,
  type RecognitionModelIdentity,
} from './modelIdentity';

let cached: Promise<RecognitionModelIdentity> | null = null;

function modelFingerprint(localUri: string): string {
  const file = new File(localUri);
  const size = typeof file.size === 'number' ? file.size : 0;
  const modificationTime =
    typeof file.modificationTime === 'number' ? file.modificationTime : 0;
  return `${size}:${modificationTime}`;
}

async function loadIdentity(): Promise<RecognitionModelIdentity> {
  const localUri = await resolveModelLocalUri();
  const fingerprint = modelFingerprint(localUri);

  await faceSearchRepository.initialize();
  const stored = await faceSearchRepository.getModelIdentityRecord();

  if (
    stored &&
    stored.fingerprint === fingerprint &&
    stored.modelVersion === faceSearch.modelVersion
  ) {
    console.warn(`[ModelIdentity] cache=hit fingerprint=${fingerprint}`);
    return {
      sha256: stored.sha256,
      modelVersion: stored.modelVersion,
      pipelineVersion: stored.pipelineVersion,
    };
  }

  console.warn(`[ModelIdentity] cache=miss fingerprint=${fingerprint}`);
  const computed = await computeRecognitionModelIdentity(localUri);

  try {
    await faceSearchRepository.saveModelIdentityRecord({
      ...computed,
      fingerprint,
      computedAt: Date.now(),
    });
  } catch (error) {
    console.warn('[ModelIdentity] falha ao gravar cache', error);
  }

  return computed;
}

/** Identidade do modelo com cache em SQLite. Hash só é recalculado se o arquivo mudar. */
export function getCachedRecognitionModelIdentity(): Promise<RecognitionModelIdentity> {
  if (!cached) {
    cached = loadIdentity().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}
