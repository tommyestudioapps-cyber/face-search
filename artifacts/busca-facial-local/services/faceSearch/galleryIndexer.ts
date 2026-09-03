import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { faceSearch } from '@/constants/faceSearch';
import {
  alignSelectedFace,
  detectFaces,
  getSelectableFaces,
  releaseFaceDetectionSession,
  releaseTemporaryUris,
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

export interface GalleryIndexOptions {
  onProgress?: (progress: FaceIndexProgress) => void;
  cancellation?: GalleryIndexCancellation;
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

  let session: FaceDetectionSession | null = null;
  const indexedFaces: IndexedFace[] = [];

  try {
    try {
      session = await detectFaces(asset.uri);
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
          const embedding = await runFaceEmbedding(inputTensor);

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
            await releaseTemporaryUris([alignedFace.uri]);
          }
        }
      }
    }

    throwIfCancelled(cancellation);
    await faceSearchRepository.saveIndexedPhoto(
      createIndexedPhoto(asset, indexedFaces.length),
      indexedFaces,
    );

    return {
      indexed: true,
      skipped: false,
      faceCount: indexedFaces.length,
    };
  } finally {
    await releaseFaceDetectionSession(session);
  }
}

async function requestGalleryPermission(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new FaceRecognitionError(
      'web-unsupported',
      'A indexação da galeria está disponível somente no APK.',
    );
  }

  const available = await MediaLibrary.isAvailableAsync();
  if (!available) {
    throw new FaceRecognitionError(
      'permission-denied',
      'A galeria de fotos não está disponível neste dispositivo.',
    );
  }

  let permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (!permission.granted || permission.accessPrivileges === 'none') {
    permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  }

  if (!permission.granted || permission.accessPrivileges === 'none') {
    throw new FaceRecognitionError(
      'permission-denied',
      'A permissão para ler a galeria de fotos foi negada.',
    );
  }
}

export async function indexGallery(
  options: GalleryIndexOptions = {},
): Promise<GalleryIndexResult> {
  const cancellation = options.cancellation ?? new GalleryIndexCancellation();
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
  try {
    if (Platform.OS === 'web') {
      throw new FaceRecognitionError(
        'web-unsupported',
        'A indexação da galeria está disponível somente no APK.',
      );
    }

    emitProgress({ status: 'requesting-permission' });
    await requestGalleryPermission();
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