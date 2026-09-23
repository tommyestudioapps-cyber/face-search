import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { faceSearch } from '@/constants/faceSearch';
import {
  alignSelectedFace,
  cleanupTempFiles,
  detectFaces,
  getSelectableFaces,
  releaseFaceDetectionSession,
} from '../faceCapture';
import {
  FaceCaptureError,
  type AlignedFace,
  type FaceDetectionSession,
} from '../faceCapture/types';
import {
  FaceRecognitionError,
  type FaceIndexProgress,
  type FaceSearchModelMetadata,
  type IndexedFace,
  type IndexedPhoto,
} from './types';
import {
  faceSearchRepository,
  getModelStorageVersion,
} from './repository';
import { preprocessAlignedFace } from './preprocessing';
import {
  releaseRecognitionModel,
  runFaceEmbedding,
} from './model';
import {
  shouldLogPhoto,
  logIndexProgress,
  logPhotoTiming,
  yieldToEventLoop,
} from '../observability/logger';
import { requestGalleryPhotoPermission } from '../backgroundIndexing/galleryPermission';

export interface GalleryIndexOptions {
  onProgress?: (progress: FaceIndexProgress) => void;
  cancellation?: GalleryIndexCancellation;
  albumId?: string | null;
}

export interface GalleryIndexResult {
  status: 'completed' | 'cancelled';
  processedAssets: number;
  totalAssets: number;
  indexedPhotos: number;
  skippedAssets: number;
  indexedFaces: number;
  removedPhotos: number;
}

export interface GalleryIndexTask {
  promise: Promise<GalleryIndexResult>;
  cancel: () => void;
}

export class GalleryIndexCancellation {
  private cancelled = false;

  cancel(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }
}

interface AssetIndexResult {
  indexed: boolean;
  skipped: boolean;
  faceCount: number;
}

let activeIndexing = false;

function getCurrentModelMetadata(): FaceSearchModelMetadata {
  return {
    name: 'MobileFaceNet',
    version: faceSearch.modelVersion,
    input: {
      width: faceSearch.input.width,
      height: faceSearch.input.height,
      channels: faceSearch.input.channels,
    },
    embeddingDimension: faceSearch.embeddingDimension,
    pixelNormalization: {
      mean: faceSearch.pixelNormalization.mean,
      stddev: faceSearch.pixelNormalization.stddev,
    },
  };
}

function makeInitialProgress(): FaceIndexProgress {
  return {
    status: 'idle',
    processedAssets: 0,
    totalAssets: null,
    indexedFaces: 0,
    skippedAssets: 0,
    currentAssetId: null,
    error: null,
  };
}

function isCancellationError(error: unknown): boolean {
  return error instanceof FaceRecognitionError && error.code === 'cancelled';
}

function throwIfCancelled(cancellation: GalleryIndexCancellation): void {
  if (cancellation.isCancelled()) {
    throw new FaceRecognitionError(
      'cancelled',
      'A indexação da galeria foi cancelada.',
    );
  }
}

function toIndexError(error: unknown): FaceRecognitionError {
  if (error instanceof FaceRecognitionError) {
    return error;
  }
  if (error instanceof Error) {
    return new FaceRecognitionError(
      'indexing-failed',
      error.message,
      error,
    );
  }
  return new FaceRecognitionError(
    'indexing-failed',
    'Falha desconhecida durante a indexação da galeria.',
    error,
  );
}

function isSkippableAssetError(error: unknown): boolean {
  if (!(error as FaceCaptureError)?.code) {
    return false;
  }

  const code = (error as FaceCaptureError).code;
  return (
    code === 'invalid-image' ||
    code === 'processing-failed' ||
    code === 'quality-rejected'
  );
}

function isSkippableFaceError(error: unknown): boolean {
  if (error instanceof FaceRecognitionError) {
    return error.code === 'invalid-input';
  }
  return isSkippableAssetError(error);
}

function isUnchangedAsset(
  asset: MediaLibrary.Asset,
  indexedPhoto: IndexedPhoto | undefined,
): boolean {
  return (
    indexedPhoto !== undefined &&
    indexedPhoto.assetId === asset.id &&
    indexedPhoto.modificationTime === asset.modificationTime &&
    indexedPhoto.modelVersion === faceSearch.modelVersion
  );
}

function createIndexedPhoto(
  asset: MediaLibrary.Asset,
  faceCount: number,
): IndexedPhoto {
  return {
    assetId: asset.id,
    uri: asset.uri,
    filename: asset.filename,
    creationTime: asset.creationTime,
    modificationTime: asset.modificationTime,
    width: asset.width,
    height: asset.height,
    modelVersion: faceSearch.modelVersion,
    indexedAt: Date.now(),
    faceCount,
  };
}

async function indexAsset(
  asset: MediaLibrary.Asset,
  indexedPhoto: IndexedPhoto | undefined,
  cancellation: GalleryIndexCancellation,
): Promise<AssetIndexResult> {
  throwIfCancelled(cancellation);

  if (isUnchangedAsset(asset, indexedPhoto)) {
    return { indexed: false, skipped: false, faceCount: 0 };
  }

  const startedAt = Date.now();
  let detectMs = 0;
  let embedMs = 0;

  let session: FaceDetectionSession | null = null;
  const indexedFaces: IndexedFace[] = [];

  try {
    try {
      const t0 = Date.now();
      session = await detectFaces(asset.uri);
      detectMs += Date.now() - t0;
    } catch (error) {
      if (error instanceof FaceCaptureError && error.code === 'no-face') {
        session = null;
      } else if (isSkippableAssetError(error)) {
        return { indexed: false, skipped: true, faceCount: 0 };
      } else {
        throw error;
      }
    }

    if (session) {
      for (const detectedFace of getSelectableFaces(session.faces)) {
        throwIfCancelled(cancellation);
        let alignedFace: AlignedFace | null = null;

        try {
          alignedFace = await alignSelectedFace(session, detectedFace.id);
          const inputTensor = await preprocessAlignedFace(alignedFace);
          const t0 = Date.now();
          const embedding = await runFaceEmbedding(inputTensor);
          embedMs += Date.now() - t0;

          indexedFaces.push({
            id: `${asset.id}:${detectedFace.id}`,
            assetId: asset.id,
            faceIndex: detectedFace.id,
            boundingBox: detectedFace.boundingBox,
            embedding,
            modelVersion: embedding.model.version,
            indexedAt: Date.now(),
          });
        } catch (error) {
          if (!isSkippableFaceError(error)) {
            throw error;
          }
        } finally {
          if (alignedFace) {
            await cleanupTempFiles([alignedFace.uri]);
          }
        }
      }
    }

    throwIfCancelled(cancellation);
    await faceSearchRepository.saveIndexedPhoto(
      createIndexedPhoto(asset, indexedFaces.length),
      indexedFaces,
    );

    if (shouldLogPhoto()) {
      logPhotoTiming({
        assetId: asset.id,
        totalMs: Date.now() - startedAt,
        detectMs,
        embedMs,
        faceCount: indexedFaces.length,
        skipped: false,
      });
    }

    return {
      indexed: true,
      skipped: false,
      faceCount: indexedFaces.length,
    };
  } finally {
    await releaseFaceDetectionSession(session);
  }
}

export async function indexGallery(
  options: GalleryIndexOptions = {},
): Promise<GalleryIndexResult> {
  const cancellation = options.cancellation ?? new GalleryIndexCancellation();
  const albumId = options.albumId ?? null;
  if (__DEV__) {
    console.log(`[Index] albumId=${albumId ?? 'todo o dispositivo'}`);
  }
  let progress = makeInitialProgress();
  let totalAssets = 0;
  let indexedPhotoCount = 0;
  let skippedAssets = 0;
  let indexedFaceCount = 0;
  let removedPhotos = 0;

  const emitProgress = (
    patch: Partial<FaceIndexProgress>,
  ): void => {
    progress = { ...progress, ...patch };
    options.onProgress?.(progress);
  };

  if (activeIndexing) {
    const error = new FaceRecognitionError(
      'indexing-failed',
      'Já existe uma indexação da galeria em andamento.',
    );
    emitProgress({ status: 'error', error });
    throw error;
  }

  activeIndexing = true;
  const indexStartedAt = Date.now();
  try {
    if (Platform.OS === 'web') {
      throw new FaceRecognitionError(
        'web-unsupported',
        'A indexação da galeria está disponível somente no APK.',
      );
    }

    emitProgress({ status: 'requesting-permission' });
    await requestGalleryPhotoPermission();
    throwIfCancelled(cancellation);

    await faceSearchRepository.initialize();
    await faceSearchRepository.invalidateIfModelChanged(
      getCurrentModelMetadata(),
    );
    const indexedPhotos = await faceSearchRepository.getIndexedPhotos();
    const indexedById = new Map(
      indexedPhotos.map((photo) => [photo.assetId, photo]),
    );
    const galleryAssetIds: string[] = [];
    let cursor: string | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      throwIfCancelled(cancellation);

      const page = await MediaLibrary.getAssetsAsync({
        first: faceSearch.indexing.batchSize,
        after: cursor,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [MediaLibrary.SortBy.modificationTime],
        ...(albumId ? { album: albumId } : {}),
      });
      totalAssets = page.totalCount;
      emitProgress({
        status: 'indexing',
        totalAssets,
        currentAssetId: null,
      });

      if (page.assets.length === 0) {
        break;
      }

      for (const asset of page.assets) {
        throwIfCancelled(cancellation);
        galleryAssetIds.push(asset.id);
        emitProgress({ currentAssetId: asset.id });

        const result = await indexAsset(
          asset,
          indexedById.get(asset.id),
          cancellation,
        );
        if (result.indexed) {
          indexedPhotoCount += 1;
          indexedFaceCount += result.faceCount;
        }
        if (result.skipped) {
          skippedAssets += 1;
        }

        progress = {
          ...progress,
          processedAssets: progress.processedAssets + 1,
          indexedFaces: indexedFaceCount,
          skippedAssets,
          currentAssetId: null,
        };
        options.onProgress?.(progress);
        if (progress.processedAssets % 20 === 0) {
          logIndexProgress(
            progress.processedAssets,
            totalAssets,
            Date.now() - indexStartedAt,
          );
        }

        await yieldToEventLoop();
      }

      cursor = page.endCursor;
      hasNextPage = page.hasNextPage;
    }

    throwIfCancelled(cancellation);
    removedPhotos = await faceSearchRepository.removeOrphanedPhotos(
      galleryAssetIds,
    );
    emitProgress({
      status: 'completed',
      totalAssets,
      currentAssetId: null,
      error: null,
    });

    return {
      status: 'completed',
      processedAssets: progress.processedAssets,
      totalAssets,
      indexedPhotos: indexedPhotoCount,
      skippedAssets,
      indexedFaces: indexedFaceCount,
      removedPhotos,
    };
  } catch (error) {
    if (isCancellationError(error)) {
      const cancelled = toIndexError(error);
      emitProgress({
        status: 'cancelled',
        currentAssetId: null,
        error: cancelled,
      });
      return {
        status: 'cancelled',
        processedAssets: progress.processedAssets,
        totalAssets,
        indexedPhotos: indexedPhotoCount,
        skippedAssets,
        indexedFaces: indexedFaceCount,
        removedPhotos,
      };
    }

    const indexError = toIndexError(error);
    emitProgress({
      status: 'error',
      currentAssetId: null,
      error: indexError,
    });
    throw indexError;
  } finally {
    releaseRecognitionModel();
    activeIndexing = false;
  }
}

export function startGalleryIndex(
  options: Omit<GalleryIndexOptions, 'cancellation'> = {},
): GalleryIndexTask {
  const cancellation = new GalleryIndexCancellation();
  return {
    promise: indexGallery({ ...options, cancellation }),
    cancel: () => cancellation.cancel(),
  };
}

export { getModelStorageVersion };