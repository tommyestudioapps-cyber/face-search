import {
  countGalleryAssets,
  forceResetActiveIndexing,
  indexGallery,
  type CancelReason,
  type GalleryIndexCancellationContract,
} from '@/services/faceSearch/galleryIndexer';
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

export interface BackgroundIndexBatchOutcome {
  status: 'completed' | 'paused' | 'cancelled' | 'waiting' | 'blocked';
  cumulativeProcessed: number;
  cumulativeTotal: number | null;
}

const MAX_ASSETS_PER_RUN = 16;
const TIME_BUDGET_MS = 15_000;

export interface RunBackgroundIndexBatchOptions {
  maxAssets?: number;
  timeBudgetMs?: number;
  albumId?: string | null;
  onPartialProgress?: (processedAssets: number, totalAssets: number | null) => void;
  trigger?: 'auto' | 'explicit';
  registerAbortHandler?: (abort: () => void) => void;
}

async function persistBackgroundState(
  patch: Parameters<typeof faceSearchRepository.updateBackgroundIndexState>[0],
): Promise<void> {
  await faceSearchRepository.updateBackgroundIndexState(patch);
}

async function canContinue(): Promise<boolean> {
  const consentOk = (await getBackgroundIndexConsent()) === 'accepted';
  const hasFull = await hasFullGalleryPhotoPermission();
  if (__DEV__) {
    console.log(`[Perm:diag] ctx=batch-canContinue consent=${consentOk} full=${hasFull}`);
  }
  return consentOk && hasFull;
}

function createBatchCancellation(): GalleryIndexCancellationContract {
  let cancelled = false;
  let reason: CancelReason | null = null;
  return {
    cancel(nextReason: CancelReason = 'user') {
      if (cancelled) return;
      cancelled = true;
      reason = nextReason;
    },
    isCancelled: () => cancelled,
    getReason: () => reason ?? 'user',
  };
}

export async function runBackgroundIndexBatch(
  options: RunBackgroundIndexBatchOptions = {},
): Promise<BackgroundIndexBatchOutcome | null> {
  return indexCoordinator.run(
    'background',
    () => runCoordinatedBackgroundIndexBatch(options),
  );
}

async function runCoordinatedBackgroundIndexBatch(
  options: RunBackgroundIndexBatchOptions = {},
): Promise<BackgroundIndexBatchOutcome | null> {
  const maxAssets = options.maxAssets ?? MAX_ASSETS_PER_RUN;
  const timeBudgetMs = options.timeBudgetMs ?? TIME_BUDGET_MS;
  const activeGeneration = await faceSearchRepository.getActiveScanGeneration();
  const previousState = await faceSearchRepository.getBackgroundIndexState();
  const previousProcessed = previousState.processedAssets ?? 0;
  const onPartialProgress = options.onPartialProgress;
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
    return {
      status: 'waiting',
      cumulativeProcessed: previousProcessed,
      cumulativeTotal: previousState.totalAssets,
    };
  }
  const checkpoint = await loadBackgroundIndexCursor();
  const resume = checkpoint?.generation === activeGeneration ? checkpoint : undefined;
  const startOffset = resume
    ? Math.max(previousProcessed, resume.processedAssets ?? 0)
    : 0;
  const currentBatchProcessedRef = { current: 0 };
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
      console.warn(
        `[batchRunner] Lease zumbi da geração ${activeGeneration} retido após encerramento do processo. Forçando liberação...`,
      );
      await faceSearchRepository.forceAbortActiveScan();
    }
  }
  const leaseOwner = `${Date.now()}-${Math.random()}`;
  const trigger = options.trigger ?? 'auto';
  if (
    trigger === 'auto' &&
    !resume &&
    previousState.status === 'completed' &&
    activeGeneration === null
  ) {
    console.warn(
      '[Batch] pulando reindexação automática (estado já completed)',
    );
    return {
      status: 'completed',
      cumulativeProcessed: previousState.processedAssets,
      cumulativeTotal: previousState.totalAssets,
    };
  }
  const generation = resume ? resume.generation : await faceSearchRepository.beginScan(leaseOwner);
  const after = resume?.cursor;
  if (resume && !(await faceSearchRepository.claimScan(generation, leaseOwner))) {
    return {
      status: 'blocked',
      cumulativeProcessed: previousProcessed,
      cumulativeTotal: previousState.totalAssets,
    }; // Another runtime owns this execution; it will keep the checkpoint.
  }

  let assumedTotal: number | undefined =
    resume && typeof previousState.totalAssets === 'number'
      ? previousState.totalAssets
      : undefined;
  if (!resume && typeof countGalleryAssets === 'function') {
    console.warn('[Batch] contando fotos reais antes de indexar gen=' + generation);
    try {
      assumedTotal = await countGalleryAssets(options.albumId ?? null);
      console.warn('[Batch] total real de fotos=' + assumedTotal);
    } catch (countError) {
      console.warn('[Batch] falha ao contar fotos; usando fallback', countError);
      assumedTotal = undefined;
    }
  }
  const latestTotalRef: { current: number | null } = {
    current: assumedTotal ?? null,
  };

  console.warn('[Batch] iniciando batch gen=' + generation);
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
        totalAssets: assumedTotal ?? null,
        lastAssetId: null,
        lastStartedAt: Date.now(),
        lastCompletedAt: null,
        lastError: null,
      });

  const cancellation = createBatchCancellation();
  let leaseHealthy = true;
  let abortedByTimeout = false;
  const heartbeat = setInterval(() => {
    void faceSearchRepository.renewScan(generation, leaseOwner)
      .then((renewed) => { if (!renewed) leaseHealthy = false; })
      .catch((error) => {
        leaseHealthy = false;
        console.warn('[BackgroundIndex] Não foi possível renovar a reserva.', error);
      });
  }, 15_000);
  options.registerAbortHandler?.(() => {
    abortedByTimeout = true;
    clearInterval(heartbeat);
    leaseHealthy = false;
    cancellation.cancel('lease');
    if (typeof forceResetActiveIndexing === 'function') {
      forceResetActiveIndexing();
    }
    void faceSearchRepository.releaseScan(generation, leaseOwner).catch(() => {});
  });
  try {
    const result = await indexGallery({
      albumId: options.albumId,
      assumedTotalAssets: assumedTotal,
      cancellation,
      onProgress: (() => {
        let lastEmitAt = 0;
        return (progress: { processedAssets: number; totalAssets: number | null }) => {
          currentBatchProcessedRef.current = progress.processedAssets;
          if (typeof progress.totalAssets === 'number') {
            latestTotalRef.current = progress.totalAssets;
          }
          if (!onPartialProgress) return;
          const now = Date.now();
          if (now - lastEmitAt < 500) return;
          lastEmitAt = now;
          const cumulative = startOffset + progress.processedAssets;
          const total = latestTotalRef.current ?? assumedTotal ?? null;
          const capped = total !== null
            ? Math.min(cumulative, total)
            : cumulative;
          onPartialProgress(capped, total);
        };
      })(),
      batch: {
        after,
        generation,
        leaseOwner,
        maxAssets,
        timeBudgetMs,
        shouldContinue: async () => {
          if (!leaseHealthy) {
            cancellation.cancel('lease');
            return false;
          }
          if (!(await canContinue())) {
            cancellation.cancel('ineligible');
            return false;
          }
          return true;
        },
        shouldYield: () => indexCoordinator.shouldYieldBackground(),
        onCheckpoint: async (cursor) => {
          if (!(await canContinue())) {
            await clearBackgroundIndexCursor();
            return;
          }
          const cumulativeForCheckpoint =
            startOffset + currentBatchProcessedRef.current;
          const totalForCheckpoint =
            latestTotalRef.current ?? assumedTotal ?? null;
          const cappedForCheckpoint = totalForCheckpoint !== null
            ? Math.min(cumulativeForCheckpoint, totalForCheckpoint)
            : cumulativeForCheckpoint;
          await saveBackgroundIndexCursor(
            cursor,
            generation,
            cappedForCheckpoint,
          );
          if (!(await canContinue())) await clearBackgroundIndexCursor();
        },
      },
    });
    console.warn(
      '[Batch] terminou status=' + result.status +
      ' processed=' + result.processedAssets +
      ' total=' + result.totalAssets +
      ' skipped=' + result.skippedAssets +
      ' removed=' + result.removedPhotos,
    );
    // Só usa a base da geração atual (zero em nova, checkpoint em retomada).
    // NÃO herda previousProcessed de gerações anteriores.
    const baseFromGeneration = startOffset + result.processedAssets;
    const totalForCap =
      result.totalAssets ?? latestTotalRef.current ?? assumedTotal ?? null;
    const finalProcessed = totalForCap !== null
      ? Math.min(baseFromGeneration, totalForCap)
      : baseFromGeneration;
    if (result.status === 'completed') {
      await clearBackgroundIndexCursor();
      await persistBackgroundState({
        status: 'completed',
        scope: 'gallery',
        processedAssets: finalProcessed,
        // Ao concluir, o total DEVE ser igual ao processado. Isso evita
        // mostrar "X de Y fotos" com X < Y na UI — que parece incompleto
        // mesmo estando finalizado.
        totalAssets: finalProcessed,
        lastAssetId: result.lastAssetId ?? null,
        lastCompletedAt: Date.now(),
        lastError: null,
      });
    } else if (result.status === 'paused') {
      console.warn('[Batch] pausado por orçamento processed=' + result.processedAssets);
      await persistBackgroundState({
        status: 'paused',
        scope: 'gallery',
        processedAssets: finalProcessed,
        totalAssets: result.totalAssets,
        lastAssetId: result.lastAssetId ?? null,
        lastError: null,
      });
    }
    if (result.status === 'cancelled') {
      const reason = result.cancelReason ?? 'user';
      if (reason === 'lease') {
        console.warn(
          '[Batch] cancelado por lease; convertendo para paused',
        );
        await persistBackgroundState({
          status: 'paused',
          scope: 'gallery',
          processedAssets: finalProcessed,
          totalAssets: result.totalAssets,
          lastAssetId: result.lastAssetId ?? null,
          lastError: null,
        });
      } else {
        await faceSearchRepository.abortScan(generation, leaseOwner);
        await persistBackgroundState({
          status: 'cancelled',
          scope: 'gallery',
          processedAssets: finalProcessed,
          totalAssets: result.totalAssets,
          lastAssetId: result.lastAssetId ?? null,
          lastError: null,
        });
      }
    }
    // A cancelled batch leaves its last completed page checkpoint intact.
    const returnedStatus: BackgroundIndexBatchOutcome['status'] =
      result.status === 'cancelled' && result.cancelReason === 'lease'
        ? 'paused'
        : result.status === 'cancelled'
          ? 'cancelled'
          : result.status === 'completed'
            ? 'completed'
            : 'paused';
    return {
      status: returnedStatus,
      cumulativeProcessed: finalProcessed,
      cumulativeTotal:
        result.status === 'completed' ? finalProcessed : result.totalAssets,
    };
  } catch (error) {
    const isLeaseInterruption =
      abortedByTimeout ||
      (cancellation.isCancelled() && cancellation.getReason() === 'lease') ||
      (error instanceof Error &&
        error.message.includes('A geração da varredura foi interrompida.'));
    if (isLeaseInterruption) {
      const partialCumulative = startOffset + currentBatchProcessedRef.current;
      const totalForCap = latestTotalRef.current ?? assumedTotal ?? null;
      const cappedPartial =
        totalForCap !== null
          ? Math.min(partialCumulative, totalForCap)
          : partialCumulative;
      console.warn(
        '[Batch] interrupção de lease/timeout capturada; preservando estado como paused processed=' +
          cappedPartial,
      );
      try {
        await persistBackgroundState({
          status: 'paused',
          scope: 'gallery',
          processedAssets: cappedPartial,
          totalAssets: totalForCap,
          lastError: null,
        });
      } catch (persistError) {
        console.warn(
          '[BackgroundIndex] Não foi possível persistir pausa após interrupção.',
          persistError,
        );
      }
      return {
        status: 'paused',
        cumulativeProcessed: cappedPartial,
        cumulativeTotal: totalForCap,
      };
    }
    // Other errors can retry the saved page; an invalid cursor must restart
    // the generation from the beginning on the next run.
    if (error instanceof FaceRecognitionError && error.code === 'invalid-cursor') {
      await clearBackgroundIndexCursor();
      await faceSearchRepository.abortScan(generation, leaseOwner);
    }
    try {
      await persistBackgroundState({
        status: 'error',
        scope: 'gallery',
        lastError: error instanceof Error ? error.message : 'Falha desconhecida na indexação.',
      });
    } catch (persistError) {
      console.warn(
        '[BackgroundIndex] Não foi possível persistir o estado de erro.',
        persistError,
      );
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
    await faceSearchRepository.releaseScan(generation, leaseOwner);
  }
}