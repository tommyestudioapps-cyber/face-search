import {
  registerPauseHandler,
  startIndexingForeground,
  stopIndexingForeground,
  updateIndexingProgress,
} from './foregroundService';
import {
  runBackgroundIndexBatch,
  type BackgroundIndexBatchOutcome,
} from './batchRunner';
import { getBackgroundIndexConsent } from './consent';

export interface ForegroundIndexingHandle {
  promise: Promise<void>;
  cancel: () => void;
  isRunning: () => boolean;
}

export interface ForegroundIndexingOptions {
  maxAssets?: number;
  timeBudgetMs?: number;
  onPartialProgress?: (processedAssets: number, totalAssets: number | null) => void;
  onFinalOutcome?: (
    outcome: BackgroundIndexBatchOutcome,
  ) => void | Promise<void>;
}

const DEFAULT_MAX_ASSETS = 500;
const DEFAULT_TIME_BUDGET_MS = 120_000;

let activeHandle: ForegroundIndexingHandle | null = null;

export function getActiveForegroundIndexing(): ForegroundIndexingHandle | null {
  return activeHandle;
}

async function waitOrCancel(
  ms: number,
  isCancelled: () => boolean,
): Promise<boolean> {
  const step = 500;
  const iterations = Math.ceil(ms / step);
  for (let i = 0; i < iterations; i += 1) {
    if (isCancelled()) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, step));
  }
  return isCancelled();
}

export function startForegroundIndexing(
  options: ForegroundIndexingOptions = {},
): ForegroundIndexingHandle {
  if (activeHandle && activeHandle.isRunning()) {
    return activeHandle;
  }

  const maxAssets = options.maxAssets ?? DEFAULT_MAX_ASSETS;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;

  let cancelled = false;

  const promise = (async () => {
    if (__DEV__) {
      console.log('[ForegroundIndex] loop iniciado');
    }
    // Registra o handler de "Pausar" ANTES de iniciar o serviço.
    registerPauseHandler(() => {
      cancelled = true;
    });
    try {
      await startIndexingForeground();
    } catch (error) {
      console.warn('[ForegroundIndex] falha ao iniciar serviço', error);
    }
    try {
      let finalOutcome: BackgroundIndexBatchOutcome | null = null;
      let lastOutcome: BackgroundIndexBatchOutcome | null = null;
      while (!cancelled) {
        const consent = await getBackgroundIndexConsent();
        if (consent !== 'accepted') {
          if (__DEV__) {
            console.log(`[ForegroundIndex] loop saindo: consent=${consent}`);
          }
          break;
        }

        let outcome: BackgroundIndexBatchOutcome | null = null;
        try {
          outcome = await runBackgroundIndexBatch({
            maxAssets,
            timeBudgetMs,
            onPartialProgress: (processedAssets, totalAssets) => {
              options.onPartialProgress?.(processedAssets, totalAssets);
              void updateIndexingProgress(processedAssets, totalAssets);
            },
          });
        } catch (error) {
          console.warn('[ForegroundIndex] batch falhou', error);
          break;
        }
        if (outcome) {
          lastOutcome = outcome;
        }

        if (cancelled) {
          finalOutcome = outcome ?? lastOutcome ?? {
            status: 'cancelled',
            cumulativeProcessed: 0,
            cumulativeTotal: null,
          };
          if (__DEV__) {
            console.log('[ForegroundIndex] loop saindo: cancelado');
          }
          break;
        }

        if (!outcome) {
          const wasCancelled = await waitOrCancel(30_000, () => cancelled);
          if (wasCancelled) break;
          continue;
        }

        if (outcome.status === 'waiting' || outcome.status === 'blocked') {
          finalOutcome = outcome;
          break;
        }

        void updateIndexingProgress(
          outcome.cumulativeProcessed,
          outcome.cumulativeTotal,
        );
        if (outcome.status === 'completed' || outcome.status === 'cancelled') {
          finalOutcome = outcome;
          if (__DEV__) {
            console.log(
              `[ForegroundIndex] loop saindo: status=${outcome.status}`,
            );
          }
          break;
        }
      }
      if (cancelled && !finalOutcome) {
        finalOutcome = lastOutcome ?? {
          status: 'cancelled',
          cumulativeProcessed: 0,
          cumulativeTotal: null,
        };
      }
      if (finalOutcome && options.onFinalOutcome) {
        try {
          void Promise.resolve(options.onFinalOutcome(finalOutcome)).catch(
            (error) => {
              console.warn('[ForegroundIndex] callback final falhou', error);
            },
          );
        } catch (error) {
          console.warn('[ForegroundIndex] callback final falhou', error);
        }
      }
    } finally {
      if (__DEV__) {
        console.log('[ForegroundIndex] loop finalizado');
      }
      try {
        await stopIndexingForeground();
      } catch (error) {
        console.warn('[ForegroundIndex] falha ao parar serviço', error);
      }
      activeHandle = null;
    }
  })();

  const handle: ForegroundIndexingHandle = {
    promise,
    cancel: () => {
      cancelled = true;
    },
    isRunning: () => !cancelled && activeHandle === handle,
  };

  activeHandle = handle;
  return handle;
}