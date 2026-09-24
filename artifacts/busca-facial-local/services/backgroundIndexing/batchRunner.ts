import { indexGallery } from '@/services/faceSearch/galleryIndexer';
import { FaceRecognitionError } from '@/services/faceSearch/types';
import { faceSearchRepository } from '@/services/faceSearch/repository';
import {
  clearBackgroundIndexCursor,
  loadBackgroundIndexCursor,
  saveBackgroundIndexCursor,
} from './checkpoint';
import { getBackgroundIndexConsent } from './consent';
import {
  hasFullGalleryPhotoPermission,
} from './galleryPermission';
import { indexCoordinator } from './indexCoordinator';

const MAX_ASSETS_PER_RUN = 16;
const TIME_BUDGET_MS = 15_000;

async function persistBackgroundState(
  patch: Parameters<typeof faceSearchRepository.updateBackgroundIndexState>[0],
): Promise<void> {
  try {
    await faceSearchRepository.updateBackgroundIndexState(patch);
  } catch (error) {
    console.warn('[BackgroundIndex] Não foi possível salvar o estado persistido.', error);
  }
}

async function canContinue(): Promise<boolean> {
  const consentOk = (await getBackgroundIndexConsent()) === 'accepted';
  const hasFull = await hasFullGalleryPhotoPermission();
  if (__DEV__) {
    console.log(`[Perm:diag] ctx=batch-canContinue consent=${consentOk} full=${hasFull}`);
  }
  return consentOk && hasFull;
}

export async function runBackgroundIndexBatch(): Promise<void> {
  return indexCoordinator.run('background', runCoordinatedBackgroundIndexBatch);
}

async function runCoordinatedBackgroundIndexBatch(): Promise<void> {
  const activeGeneration = await faceSearchRepository.getActiveScanGeneration();
  let cachedFullPermission: boolean | null = null;
  const checkFullPermissionOnce = async (): Promise<boolean> => {
    if (cachedFullPermission === null) {
      cachedFullPermission = await hasFullGalleryPhotoPermission();
    }
    return cachedFullPermission;
  };
  if (!(await canContinue())) {
    // Permission could have been reduced to a limited selection since the last page.
    const checkpoint = await loadBackgroundIndexCursor();
    await clearBackgroundIndexCursor();
    if (checkpoint && checkpoint.generation === activeGeneration) {
      await faceSearchRepository.abortScanIfUnleased(activeGeneration);
    }
    await persistBackgroundState({
      status: 'waiting',
      scope: 'gallery',
      lastError: null,
    });
    return;
  }
  const checkpoint = await loadBackgroundIndexCursor();
  const resume = checkpoint?.generation === activeGeneration ? checkpoint : undefined;
  if (checkpoint && !resume) {
    if (activeGeneration !== null) {
      throw new FaceRecognitionError(
        'indexing-failed',
        'Outra execução da varredura da galeria está em andamento.',
      );
    }
    await clearBackgroundIndexCursor();
  }
  if (!checkpoint && activeGeneration !== null) {
    if (!(await faceSearchRepository.abortScanIfUnleased(activeGeneration))) {
      await persistBackgroundState({
        status: 'waiting',
        scope: 'gallery',
        lastError: null,
      });
      return;
    }
  }
  const leaseOwner = `${Date.now()}-${Math.random()}`;
  const generation = resume ? resume.generation : await faceSearchRepository.beginScan(leaseOwner);
  const after = resume?.cursor;
  if (resume && !(await faceSearchRepository.claimScan(generation, leaseOwner))) {
    return; // Another runtime owns this execution; it will keep the checkpoint.
  }

  await persistBackgroundState(resume
    ? {
        status: 'running',
        scope: 'gallery',
        lastStartedAt: Date.now(),
        lastError: null,
      }
    : {
        status: 'running',
        scope: 'gallery',
        processedAssets: 0,
        totalAssets: null,
        lastAssetId: null,
        lastStartedAt: Date.now(),
        lastCompletedAt: null,
        lastError: null,
      });

  let leaseHealthy = true;
  const heartbeat = setInterval(() => {
    void faceSearchRepository.renewScan(generation, leaseOwner)
      .then((renewed) => { if (!renewed) leaseHealthy = false; })
      .catch((error) => {
        leaseHealthy = false;
        console.warn('[BackgroundIndex] Não foi possível renovar a reserva.', error);
      });
  }, 15_000);
  try {
    const result = await indexGallery({
      batch: {
        after,
        generation,
        leaseOwner,
        maxAssets: MAX_ASSETS_PER_RUN,
        timeBudgetMs: TIME_BUDGET_MS,
        shouldContinue: async () => leaseHealthy && await canContinue(),
        shouldYield: () => indexCoordinator.shouldYieldBackground(),
        onCheckpoint: async (cursor) => {
          if (!(await canContinue())) {
            await clearBackgroundIndexCursor();
            return;
          }
          await saveBackgroundIndexCursor(cursor, generation);
          if (!(await canContinue())) await clearBackgroundIndexCursor();
        },
      },
    });
    if (result.status === 'completed') {
      await clearBackgroundIndexCursor();
      await persistBackgroundState({
        status: 'completed',
        scope: 'gallery',
        processedAssets: result.processedAssets,
        totalAssets: result.totalAssets,
        lastAssetId: result.lastAssetId ?? null,
        lastCompletedAt: Date.now(),
        lastError: null,
      });
    } else if (result.status === 'paused') {
      await persistBackgroundState({
        status: 'paused',
        scope: 'gallery',
        processedAssets: result.processedAssets,
        totalAssets: result.totalAssets,
        lastAssetId: result.lastAssetId ?? null,
        lastError: null,
      });
    }
    if (result.status === 'cancelled') {
      await faceSearchRepository.abortScan(generation, leaseOwner);
      await persistBackgroundState({
        status: 'cancelled',
        scope: 'gallery',
        processedAssets: result.processedAssets,
        totalAssets: result.totalAssets,
        lastAssetId: result.lastAssetId ?? null,
        lastError: null,
      });
    }
    // A cancelled batch leaves its last completed page checkpoint intact.
  } catch (error) {
    // Other errors can retry the saved page; an invalid cursor must restart
    // the generation from the beginning on the next run.
    if (error instanceof FaceRecognitionError && error.code === 'invalid-cursor') {
      await clearBackgroundIndexCursor();
      await faceSearchRepository.abortScan(generation, leaseOwner);
    }
    await persistBackgroundState({
      status: 'error',
      scope: 'gallery',
      lastError: error instanceof Error ? error.message : 'Falha desconhecida na indexação.',
    });
    throw error;
  } finally {
    clearInterval(heartbeat);
    await faceSearchRepository.releaseScan(generation, leaseOwner);
  }
}