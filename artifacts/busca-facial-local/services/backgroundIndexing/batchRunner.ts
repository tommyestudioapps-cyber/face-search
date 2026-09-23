import { indexGallery } from '@/services/faceSearch/galleryIndexer';
import { FaceRecognitionError } from '@/services/faceSearch/types';
import {
  clearBackgroundIndexCursor,
  loadBackgroundIndexCursor,
  saveBackgroundIndexCursor,
} from './checkpoint';
import { getBackgroundIndexConsent } from './consent';
import { hasGalleryPhotoPermission } from './galleryPermission';

const MAX_ASSETS_PER_RUN = 16;
const TIME_BUDGET_MS = 15_000;

async function canContinue(): Promise<boolean> {
  return (
    (await getBackgroundIndexConsent()) === 'accepted' &&
    (await hasGalleryPhotoPermission())
  );
}

export async function runBackgroundIndexBatch(): Promise<void> {
  if (!(await canContinue())) return;
  const after = await loadBackgroundIndexCursor();

  try {
    const result = await indexGallery({
      batch: {
        after,
        maxAssets: MAX_ASSETS_PER_RUN,
        timeBudgetMs: TIME_BUDGET_MS,
        shouldContinue: canContinue,
        onCheckpoint: async (cursor) => {
          if (!(await canContinue())) return;
          await saveBackgroundIndexCursor(cursor);
          if (!(await canContinue())) await clearBackgroundIndexCursor();
        },
      },
    });
    if (result.status === 'completed') {
      await clearBackgroundIndexCursor();
    }
    // A cancelled batch leaves its last completed page checkpoint intact.
  } catch (error) {
    // Only a failed gallery page/cursor resets the checkpoint. Model/SQLite
    // failures keep it, so the next run can retry instead of starting over.
    if (after && error instanceof FaceRecognitionError && error.code === 'invalid-cursor') {
      await clearBackgroundIndexCursor();
    }
    throw error;
  }
}