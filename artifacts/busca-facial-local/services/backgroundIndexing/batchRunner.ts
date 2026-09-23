import { indexGallery } from '@/services/faceSearch/galleryIndexer';
import { FaceRecognitionError } from '@/services/faceSearch/types';
import { faceSearchRepository } from '@/services/faceSearch/repository';
import {
  clearBackgroundIndexCursor,
  loadBackgroundIndexCursor,
  saveBackgroundIndexCursor,
} from './checkpoint';
import { getBackgroundIndexConsent } from './consent';
import { hasFullGalleryPhotoPermission } from './galleryPermission';

const MAX_ASSETS_PER_RUN = 16;
const TIME_BUDGET_MS = 15_000;

async function canContinue(): Promise<boolean> {
  return (
    (await getBackgroundIndexConsent()) === 'accepted' &&
    (await hasFullGalleryPhotoPermission())
  );
}

export async function runBackgroundIndexBatch(): Promise<void> {
  const activeGeneration = await faceSearchRepository.getActiveScanGeneration();
  if (!(await canContinue())) {
    // Permission could have been reduced to a limited selection since the last page.
    await clearBackgroundIndexCursor();
    if (activeGeneration !== null) {
      await faceSearchRepository.abortScan(activeGeneration);
    }
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
  const generation = resume ? resume.generation : await faceSearchRepository.beginScan();
  const after = resume?.cursor;

  try {
    const result = await indexGallery({
      batch: {
        after,
        generation,
        maxAssets: MAX_ASSETS_PER_RUN,
        timeBudgetMs: TIME_BUDGET_MS,
        shouldContinue: canContinue,
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
    }
    if (result.status === 'cancelled') {
      await faceSearchRepository.abortScan(generation);
    }
    // A cancelled batch leaves its last completed page checkpoint intact.
  } catch (error) {
    // Other errors can retry the saved page; an invalid cursor must restart
    // the generation from the beginning on the next run.
    if (error instanceof FaceRecognitionError && error.code === 'invalid-cursor') {
      await clearBackgroundIndexCursor();
      await faceSearchRepository.abortScan(generation);
    }
    throw error;
  }
}