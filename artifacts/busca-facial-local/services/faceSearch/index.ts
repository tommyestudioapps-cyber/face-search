import {
  faceSearchRepository,
} from './repository';
import {
  indexGallery as runGalleryIndex,
  startGalleryIndex as startGalleryIndexTask,
  clearAfterGalleryIndexStops,
  type GalleryIndexOptions,
  type GalleryIndexResult,
  type GalleryIndexTask,
} from './galleryIndexer';
import {
  loadRecognitionModel,
  releaseRecognitionModel,
} from './model';
import { searchAlignedFace } from './search';
import type {
  FaceIndexProgress,
  FaceSearchSummary,
  IndexedPhoto,
  StoredIndexStats,
} from './types';
import type { AlignedFace } from '../faceCapture/types';
import { clearBackgroundIndexCursor } from '../backgroundIndexing/checkpoint';
import { indexCoordinator } from '../backgroundIndexing/indexCoordinator';

let latestProgress: FaceIndexProgress = {
  status: 'idle',
  processedAssets: 0,
  totalAssets: null,
  indexedFaces: 0,
  skippedAssets: 0,
  currentAssetId: null,
  error: null,
};

const progressListeners = new Set<(progress: FaceIndexProgress) => void>();

function publishProgress(progress: FaceIndexProgress): void {
  latestProgress = progress;
  for (const listener of progressListeners) {
    listener(progress);
  }
}

function withProgress(
  options: GalleryIndexOptions = {},
): GalleryIndexOptions {
  return {
    ...options,
    onProgress: (progress) => {
      publishProgress(progress);
      options.onProgress?.(progress);
    },
  };
}

export async function initializeFaceSearch(): Promise<void> {
  await indexCoordinator.run('initializing', async () => {
    await faceSearchRepository.initialize();
    await loadRecognitionModel();
  });
}

export async function disposeFaceSearch(): Promise<void> {
  await indexCoordinator.run('dispose', async () => {
    releaseRecognitionModel();
    await faceSearchRepository.close();
  });
}

export function getFaceIndexProgress(): FaceIndexProgress {
  return latestProgress;
}

export function subscribeToFaceIndexProgress(
  listener: (progress: FaceIndexProgress) => void,
): () => void {
  progressListeners.add(listener);
  listener(latestProgress);
  return () => {
    progressListeners.delete(listener);
  };
}

export function startGalleryIndexing(
  options: Omit<GalleryIndexOptions, 'onProgress'> & {
    onProgress?: GalleryIndexOptions['onProgress'];
  } = {},
): GalleryIndexTask {
  return startGalleryIndexTask(withProgress(options));
}

export async function indexGallery(
  options: GalleryIndexOptions = {},
): Promise<GalleryIndexResult> {
  return runGalleryIndex(withProgress(options));
}

export async function searchFace(
  alignedFace: AlignedFace,
): Promise<FaceSearchSummary> {
  return searchAlignedFace(alignedFace);
}

export async function readIndexedPhotos(): Promise<IndexedPhoto[]> {
  await faceSearchRepository.initialize();
  return faceSearchRepository.getIndexedPhotos();
}

export async function readIndexedPhotosWithFaceCounts(): Promise<IndexedPhoto[]> {
  await faceSearchRepository.initialize();
  return faceSearchRepository.getIndexedPhotosWithFaceCounts();
}

export async function getStoredIndexStats(): Promise<StoredIndexStats> {
  await faceSearchRepository.initialize();
  return faceSearchRepository.getStoredIndexStats();
}

export async function clearStoredIndex(): Promise<void> {
  await indexCoordinator.run('clear', async () => {
    await clearAfterGalleryIndexStops(async () => {
      await faceSearchRepository.initialize();
      await faceSearchRepository.clearIndex();
      await clearBackgroundIndexCursor();
    });
  });
}

export * from './types';
export * from './galleryIndexer';
export { searchAlignedFace };