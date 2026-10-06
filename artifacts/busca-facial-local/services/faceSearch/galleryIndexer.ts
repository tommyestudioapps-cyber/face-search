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
import { getRecognitionModelIdentity } from './modelIdentity';
import { cosineSimilarity } from './searchMath';
import {
  shouldLogPhoto,
  logIndexProgress,
  logPhotoTiming,
  yieldToEventLoop,
} from '../observability/logger';
import {
  hasGalleryPhotoPermission,
  hasFullGalleryPhotoPermission,
  requestGalleryPhotoPermission,
} from '../backgroundIndexing/galleryPermission';
import { shouldPauseBatch } from '../backgroundIndexing/batchPolicy';
import { indexCoordinator } from '../backgroundIndexing/indexCoordinator';
import { clearBackgroundIndexCursor, loadBackgroundIndexCursor } from '../backgroundIndexing/checkpoint';

export interface GalleryIndexBatch {
  after?: string;
  generation: number;
  leaseOwner: string;
  maxAssets: number;
  timeBudgetMs: number;
  onCheckpoint: (cursor: string) => Promise<void>;
  shouldContinue: () => Promise<boolean>;
  shouldYield?: () => boolean;
}

export interface GalleryIndexOptions {
  onProgress?: (progress: FaceIndexProgress) => void;
  cancellation?: GalleryIndexCancellation;
  albumId?: string | null;
  batch?: GalleryIndexBatch;
  queryEmbeddings?: Float32Array[];
  onMatch?: (assetId: string, similarity: number) => void;
}

export interface GalleryIndexResult {
  status: 'completed' | 'cancelled' | 'paused';
  nextCursor?: string;
  processedAssets: number;
  totalAssets: number;
  lastAssetId: string | null;
  indexedPhotos: number;
  skippedAssets: number;
  indexedFaces: number;
  removedPhotos: number;
  matches: Array<{ assetId: string; similarity: number }>;
}

export interface GalleryIndexTask {
  promise: Promise<GalleryIndexResult>;
  cancel: () => void;
}

interface MatchContext {
  queryEmbeddings: Float32Array[];
  threshold: number;
  storedEmbeddingsByAsset: Map<string, Float32Array[]>;
  matches: Array<{ assetId: string; similarity: number }>;
  onMatch?: (assetId: string, similarity: number) => void;
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
let activeIndexingFinished: Promise<void> | null = null;
let finishActiveIndexing: (() => void) | null = null;
let clearingIndex = false;

export async function clearAfterGalleryIndexStops(
  clear: () => Promise<void>,
): Promise<void> {
  if (clearingIndex) {
    throw new FaceRecognitionError('indexing-failed', 'A limpeza do índice já está em andamento.');
  }
  clearingIndex = true;
  try {
    await activeIndexingFinished;
    await clear();
  } finally {
    clearingIndex = false;
  }
}

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

function getCurrentModelStorageVersion(): string {
  return getModelStorageVersion(getCurrentModelMetadata());
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

function logSkippedIndexError(
  assetId: string,
  faceId: number | 'none',
  error: unknown,
): void {
  const code =
    error instanceof FaceCaptureError || error instanceof FaceRecognitionError
      ? error.code
      : 'unknown';
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[Index:face:agg] asset=${assetId} face=${faceId} code=${code} message=${JSON.stringify(message)}`,
  );
}

function isUnchangedAsset(
  asset: MediaLibrary.Asset,
  indexedPhoto: IndexedPhoto | undefined,
): boolean {
  return (
    indexedPhoto !== undefined &&
    indexedPhoto.assetId === asset.id &&
    indexedPhoto.modificationTime === asset.modificationTime &&
    indexedPhoto.modelVersion === getCurrentModelStorageVersion()
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
    modelVersion: getCurrentModelStorageVersion(),
    indexedAt: Date.now(),
    faceCount,
  };
}

function computeAssetMatch(
  faceEmbeddings: Float32Array[],
  queryEmbeddings: Float32Array[],
  threshold: number,
): number | null {
  if (queryEmbeddings.length === 0) return null;
  if (faceEmbeddings.length === 0) return null;
  let minBestSim = Number.POSITIVE_INFINITY;
  for (const query of queryEmbeddings) {
    let bestSim = -1;
    for (const face of faceEmbeddings) {
      const sim = cosineSimilarity(query, face);
      if (sim > bestSim) bestSim = sim;
    }
    if (bestSim < threshold) return null;
    if (bestSim < minBestSim) minBestSim = bestSim;
  }
  return minBestSim === Number.POSITIVE_INFINITY ? null : minBestSim;
}

async function indexAsset(
  asset: MediaLibrary.Asset,
  indexedPhoto: IndexedPhoto | undefined,
  cancellation: GalleryIndexCancellation,
  shouldContinue?: () => Promise<boolean>,
  generation?: number,
  leaseOwner?: string,
  matchContext?: MatchContext,
): Promise<AssetIndexResult> {
  throwIfCancelled(cancellation);

  if (isUnchangedAsset(asset, indexedPhoto)) {
    if (matchContext && matchContext.queryEmbeddings.length > 0) {
      const faceEmbeddings =
        matchContext.storedEmbeddingsByAsset.get(asset.id) ?? [];
      const similarity = computeAssetMatch(
        faceEmbeddings,
        matchContext.queryEmbeddings,
        matchContext.threshold,
      );
      if (similarity !== null) {
        matchContext.matches.push({ assetId: asset.id, similarity });
        matchContext.onMatch?.(asset.id, similarity);
      }
    }
    return { indexed: false, skipped: false, faceCount: 0 };
  }

  const startedAt = Date.now();
  let detectMs = 0;
  let embedMs = 0;

  let session: FaceDetectionSession | null = null;
  const indexedFaces: IndexedFace[] = [];

  try {
    try {
      console.warn(`[Index:agg] asset=${asset.id} start`);
      const t0 = Date.now();
      session = await detectFaces(asset.uri, asset.id);
      detectMs += Date.now() - t0;
    } catch (error) {
      if (error instanceof FaceCaptureError && error.code === 'no-face') {
        logSkippedIndexError(asset.id, 'none', error);
        session = null;
      } else if (isSkippableAssetError(error)) {
        logSkippedIndexError(asset.id, 'none', error);
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
          if (isSkippableFaceError(error)) {
            logSkippedIndexError(asset.id, detectedFace.id, error);
          } else {
            throw error;
          }
        } finally {
          if (alignedFace) {
            await cleanupTempFiles([alignedFace.uri]);
          }
        }
      }
    }

    console.warn(`[Index:agg] asset=${asset.id} indexed_faces=${indexedFaces.length}`);

    throwIfCancelled(cancellation);
    if (shouldContinue && !(await shouldContinue())) {
      cancellation.cancel();
      throwIfCancelled(cancellation);
    }
    await faceSearchRepository.saveIndexedPhoto(
      createIndexedPhoto(asset, indexedFaces.length),
      indexedFaces,
      generation,
      leaseOwner,
    );

    if (matchContext && matchContext.queryEmbeddings.length > 0) {
      const faceEmbeddings = indexedFaces.map((face) => face.embedding.values);
      const similarity = computeAssetMatch(
        faceEmbeddings,
        matchContext.queryEmbeddings,
        matchContext.threshold,
      );
      if (similarity !== null) {
        matchContext.matches.push({ assetId: asset.id, similarity });
        matchContext.onMatch?.(asset.id, similarity);
      }
    }

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
  if (options.batch) return runGalleryIndex(options);
  return indexCoordinator.run('manual-index', () => runGalleryIndex(options));
}

async function runGalleryIndex(
  options: GalleryIndexOptions = {},
): Promise<GalleryIndexResult> {
  const cancellation = options.cancellation ?? new GalleryIndexCancellation();
  const albumId = options.albumId ?? null;
  const batch = options.batch;
  if (batch && (
    !Number.isInteger(batch.maxAssets) ||
    batch.maxAssets < 1 ||
    !Number.isFinite(batch.timeBudgetMs) ||
    batch.timeBudgetMs <= 0
  )) {
    throw new FaceRecognitionError('invalid-input', 'Limites inválidos para o lote do índice.');
  }
  if (__DEV__) {
    console.log(`[Index] albumId=${albumId ?? 'todo o dispositivo'}`);
  }
  let progress = makeInitialProgress();
  let totalAssets = 0;
  let indexedPhotoCount = 0;
  let workAssets = 0;
  let skippedAssets = 0;
  let indexedFaceCount = 0;
  let removedPhotos = 0;
  let lastAssetId: string | null = null;
  let scanGeneration: number | null = null;
  const manualOwner = batch ? undefined : `${Date.now()}-${Math.random()}`;
  let manualLeaseHeartbeat: ReturnType<typeof setInterval> | null = null;
  let matchContext: MatchContext | undefined;

  const emitProgress = (
    patch: Partial<FaceIndexProgress>,
  ): void => {
    progress = { ...progress, ...patch };
    options.onProgress?.(progress);
  };

  if (activeIndexing || clearingIndex) {
    const error = new FaceRecognitionError(
      'indexing-failed',
      'Já existe uma indexação da galeria em andamento.',
    );
    emitProgress({ status: 'error', error });
    throw error;
  }

  activeIndexing = true;
  activeIndexingFinished = new Promise<void>((resolve) => {
    finishActiveIndexing = resolve;
  });
  const indexStartedAt = Date.now();
  try {
    if (Platform.OS === 'web') {
      throw new FaceRecognitionError(
        'web-unsupported',
        'A indexação da galeria está disponível somente no APK.',
      );
    }

    const modelIdentity = await getRecognitionModelIdentity();
    console.warn(
      `[Index:agg] modelSha256=${modelIdentity.sha256} modelVersion=${modelIdentity.modelVersion} pipelineVersion=${modelIdentity.pipelineVersion}`,
    );

    emitProgress({ status: 'requesting-permission' });
    if (batch) {
      if (!(await hasGalleryPhotoPermission())) {
        throw new FaceRecognitionError('permission-denied', 'A permissão para ler a galeria foi revogada.');
      }
    } else {
      await requestGalleryPhotoPermission();
    }
    throwIfCancelled(cancellation);

    await faceSearchRepository.initialize();
    await faceSearchRepository.invalidateIfModelChanged(
      getCurrentModelMetadata(),
    );
    const indexedPhotos = await faceSearchRepository.getIndexedPhotos();
    const indexedById = new Map(
      indexedPhotos.map((photo) => [photo.assetId, photo]),
    );
    if (options.queryEmbeddings && options.queryEmbeddings.length > 0) {
      const storedEmbeddingsByAsset = new Map<string, Float32Array[]>();
      const modelVersion = getCurrentModelStorageVersion();
      const allIndexed = await faceSearchRepository.getIndexedEmbeddings(
        modelVersion,
      );
      for (const item of allIndexed) {
        const list = storedEmbeddingsByAsset.get(item.photo.assetId) ?? [];
        list.push(item.face.embedding.values);
        storedEmbeddingsByAsset.set(item.photo.assetId, list);
      }
      matchContext = {
        queryEmbeddings: options.queryEmbeddings,
        threshold: faceSearch.similarityThresholds.review,
        storedEmbeddingsByAsset,
        matches: [],
        onMatch: options.onMatch,
      };
    }
    // A restricted album or limited photo permission is not a complete gallery snapshot.
    const canPrune = !albumId && await hasFullGalleryPhotoPermission();
    if (!batch && canPrune) {
      const active = await faceSearchRepository.getActiveScanGeneration();
      if (active !== null) {
        const checkpoint = await loadBackgroundIndexCursor();
        if (checkpoint?.generation === active && await faceSearchRepository.abortScanIfUnleased(active)) {
          await clearBackgroundIndexCursor();
        }
      }
    }
    const generation = canPrune
      ? batch ? batch.generation : await faceSearchRepository.beginScan(manualOwner)
      : null;
    scanGeneration = generation;
    if (!batch && generation !== null && manualOwner) {
      manualLeaseHeartbeat = setInterval(() => {
        void (async () => {
          try {
            const renewed = await faceSearchRepository.renewScan(generation, manualOwner);
            if (!renewed) {
              cancellation.cancel();
            }
          } catch (firstError) {
            // Uma falha transitória (SQLITE_BUSY) não deve cancelar a indexação.
            try {
              await new Promise((resolve) => setTimeout(resolve, 2_000));
              const renewed = await faceSearchRepository.renewScan(generation, manualOwner);
              if (!renewed) {
                cancellation.cancel();
              }
            } catch (secondError) {
              cancellation.cancel();
              console.warn('[Index] Não foi possível renovar a reserva após retry.', secondError);
            }
          }
        })();
      }, 30_000);
    }
    if (batch && (
      generation === null ||
      !Number.isSafeInteger(generation) ||
      generation < 1 ||
      await faceSearchRepository.getActiveScanGeneration() !== generation
    )) {
      throw new FaceRecognitionError('indexing-failed', 'A varredura da galeria perdeu seu estado.');
    }
    let cursor: string | undefined = batch?.after;
    let hasNextPage = true;

    while (hasNextPage) {
      throwIfCancelled(cancellation);
      if (batch && !(await batch.shouldContinue())) {
        cancellation.cancel();
        throwIfCancelled(cancellation);
      }
      if (batch && progress.processedAssets > 0 && (batch.shouldYield?.() || shouldPauseBatch(
        workAssets,
        batch.maxAssets,
        Date.now() - indexStartedAt,
        batch.timeBudgetMs,
      ))) {
        return {
          status: 'paused',
          nextCursor: cursor,
          processedAssets: progress.processedAssets,
          totalAssets,
          lastAssetId,
          indexedPhotos: indexedPhotoCount,
          skippedAssets,
          indexedFaces: indexedFaceCount,
          removedPhotos: 0,
          matches: matchContext ? matchContext.matches : [],
        };
      }

      let page: MediaLibrary.PagedInfo<MediaLibrary.Asset>;
      try {
        page = await MediaLibrary.getAssetsAsync({
          first: batch ? 1 : faceSearch.indexing.batchSize,
          after: cursor,
          mediaType: MediaLibrary.MediaType.photo,
          sortBy: [MediaLibrary.SortBy.modificationTime],
          ...(albumId ? { album: albumId } : {}),
        });
      } catch (cause) {
        if (!batch || !cursor) throw cause;
        throw new FaceRecognitionError(
          'invalid-cursor',
          'Não foi possível retomar a página da galeria.',
          cause,
        );
      }
      totalAssets = page.totalCount;
      emitProgress({
        status: 'indexing',
        totalAssets,
        currentAssetId: null,
      });

      if (page.assets.length === 0) {
        if (page.hasNextPage || cursor) {
          throw new FaceRecognitionError('invalid-cursor', 'A galeria retornou uma página vazia para o cursor atual.');
        }
        break;
      }

      for (const asset of page.assets) {
        throwIfCancelled(cancellation);
        if (batch && !(await batch.shouldContinue())) {
          cancellation.cancel();
          throwIfCancelled(cancellation);
        }
        emitProgress({ currentAssetId: asset.id });

        const result = await indexAsset(
          asset,
          indexedById.get(asset.id),
          cancellation,
          batch?.shouldContinue,
          generation ?? undefined,
          batch?.leaseOwner ?? (generation !== null ? manualOwner : undefined),
          matchContext,
        );
        if (generation !== null && !result.indexed) {
          await faceSearchRepository.markAssetSeen(asset.id, generation, batch?.leaseOwner ?? manualOwner);
        }
        if (result.indexed) {
          indexedPhotoCount += 1;
          indexedFaceCount += result.faceCount;
        }
        if (result.skipped) {
          skippedAssets += 1;
        }
        if (result.indexed || result.skipped) {
          workAssets += 1;
        }

        progress = {
          ...progress,
          processedAssets: progress.processedAssets + 1,
          indexedFaces: indexedFaceCount,
          skippedAssets,
          currentAssetId: null,
        };
        lastAssetId = asset.id;
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

      const previousCursor = cursor;
      cursor = page.endCursor;
      hasNextPage = page.hasNextPage;
      if (batch && hasNextPage) {
        if (!cursor || cursor === previousCursor) {
          throw new FaceRecognitionError(
            'invalid-cursor',
            'A galeria não retornou um cursor válido para continuar o índice.',
          );
        }
        await batch.onCheckpoint(cursor);
      }
    }

    throwIfCancelled(cancellation);
    if (generation !== null && await hasFullGalleryPhotoPermission()) {
      if (batch && !(await batch.shouldContinue())) {
        cancellation.cancel();
        throwIfCancelled(cancellation);
      }
      removedPhotos = await faceSearchRepository.completeScan(generation, batch?.leaseOwner ?? manualOwner);
    }
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
      lastAssetId,
      indexedPhotos: indexedPhotoCount,
      skippedAssets,
      indexedFaces: indexedFaceCount,
      removedPhotos,
      matches: matchContext ? matchContext.matches : [],
    };
  } catch (error) {
    if (!batch && scanGeneration !== null) {
      try {
        await faceSearchRepository.abortScan(scanGeneration, manualOwner);
      } catch (abortError) {
        console.warn('[Index] Não foi possível liberar a geração após a falha.', abortError);
      }
    }
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
        lastAssetId,
        indexedPhotos: indexedPhotoCount,
        skippedAssets,
        indexedFaces: indexedFaceCount,
        removedPhotos,
        matches: matchContext ? matchContext.matches : [],
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
    if (manualLeaseHeartbeat) clearInterval(manualLeaseHeartbeat);
    try {
      if (!batch && scanGeneration !== null && manualOwner) {
        await faceSearchRepository.releaseScan(scanGeneration, manualOwner);
      }
    } catch (releaseError) {
      // The lease expires if SQLite is unavailable. Never leave the in-process
      // index guard or its clear waiters stuck because cleanup failed.
      console.warn('[Index] Não foi possível liberar a reserva da varredura.', releaseError);
    } finally {
      releaseRecognitionModel();
      activeIndexing = false;
      finishActiveIndexing?.();
      finishActiveIndexing = null;
      activeIndexingFinished = null;
    }
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