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
import { indexCoordinator } from './indexCoordinator';

export interface ForegroundIndexingHandle {
  promise: Promise<void>;
  cancel: () => void;
  isRunning: () => boolean;
  updateCallbacks: (options: ForegroundIndexingOptions) => void;
  wakeUp?: () => void;
}

export interface ForegroundIndexingOptions {
  maxAssets?: number;
  timeBudgetMs?: number;
  trigger?: 'auto' | 'explicit';
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
  shouldWakeUp?: () => boolean,
): Promise<boolean> {
  const step = 500;
  const iterations = Math.ceil(ms / step);
  for (let i = 0; i < iterations; i += 1) {
    if (isCancelled()) return true;
    if (shouldWakeUp?.()) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, step));
  }
  return isCancelled();
}

function createInactiveHandle(): ForegroundIndexingHandle {
  return {
    promise: Promise.resolve(),
    cancel: () => {},
    isRunning: () => false,
    updateCallbacks: () => {},
  };
}

export function startForegroundIndexing(
  options: ForegroundIndexingOptions = {},
): ForegroundIndexingHandle {
  if (activeHandle && activeHandle.isRunning()) {
    // Handle ativo: substituir callbacks para que a nova tela (após
    // remontagem) receba eventos a partir de agora. Sem isso, a UI nova
    // fica presa no snapshot do SQLite enquanto a notificação continua
    // avançando.
    activeHandle.updateCallbacks(options);
    activeHandle.wakeUp?.();
    return activeHandle;
  }

  const maxAssets = options.maxAssets ?? DEFAULT_MAX_ASSETS;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;

  let cancelled = false;
  let wakeUpRequested = false;
  let latestProgress: {
    processedAssets: number;
    totalAssets: number | null;
  } | null = null;
  // Refs mutáveis para os callbacks — permitem substituição em runtime
  // quando a tela é remontada sem matar o handle.
  let currentOnPartialProgress = options.onPartialProgress;
  let currentOnFinalOutcome = options.onFinalOutcome;

  const consumeWakeUp = (): boolean => {
    if (!wakeUpRequested) return false;
    wakeUpRequested = false;
    return true;
  };

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
      console.warn('[ForegroundIndex] FGS não subiu; abortando loop', error);
      activeHandle = null;
      return;
    }
    try {
      let finalOutcome: BackgroundIndexBatchOutcome | null = null;
      let lastOutcome: BackgroundIndexBatchOutcome | null = null;
      let consecutiveBatchErrors = 0;
      while (!cancelled) {
        const consent = await getBackgroundIndexConsent();
        if (consent !== 'accepted') {
          if (__DEV__) {
            console.log(`[ForegroundIndex] loop saindo: consent=${consent}`);
          }
          break;
        }

        let outcome: BackgroundIndexBatchOutcome | null = null;
        let batchTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let batchTimedOut = false;
        let abortHungBatch = null as (() => void) | null;
        let inactiveSteps = 0;
        const BATCH_HARD_TIMEOUT_MS = 5 * 60 * 1000;
        const BATCH_TIMEOUT_STEP_MS = 1_000;
        const maxInactiveSteps = Math.ceil(
          BATCH_HARD_TIMEOUT_MS / BATCH_TIMEOUT_STEP_MS,
        );
        const batchPromise = runBackgroundIndexBatch({
          maxAssets,
          timeBudgetMs,
          trigger: options.trigger,
          registerAbortHandler: (abort) => {
            abortHungBatch = abort;
          },
          onPartialProgress: (processedAssets, totalAssets) => {
            inactiveSteps = 0;
            consecutiveBatchErrors = 0;
            latestProgress = { processedAssets, totalAssets };
            currentOnPartialProgress?.(processedAssets, totalAssets);
            void updateIndexingProgress(processedAssets, totalAssets);
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          const tick = () => {
            batchTimeoutId = setTimeout(() => {
              inactiveSteps += 1;
              if (inactiveSteps >= maxInactiveSteps) {
                batchTimedOut = true;
                reject(new Error('batch hard timeout'));
                return;
              }
              tick();
            }, BATCH_TIMEOUT_STEP_MS);
          };
          tick();
        });
        try {
          outcome = await Promise.race([batchPromise, timeoutPromise]);
          consecutiveBatchErrors = 0;
        } catch (error) {
          console.warn('[ForegroundIndex] batch timeout ou erro:', error);
          consecutiveBatchErrors += 1;
          if (batchTimedOut) {
            abortHungBatch?.();
            indexCoordinator.forceRelease();
          }
          // Escape hatch: se algo está persistentemente errado, não gira
          // para sempre.
          if (consecutiveBatchErrors >= 5) {
            console.warn(
              `[ForegroundIndex] abortando após ${consecutiveBatchErrors} erros consecutivos`,
            );
            break;
          }
          // O abortHungBatch já libera a lease do SQLite imediatamente;
          // se foi apenas um timeout por suspensão, aguarda 3s (ou acorda
          // imediatamente se o app voltar ao foreground).
          const retryDelayMs = batchTimedOut ? 3_000 : 15_000;
          const wasCancelled = await waitOrCancel(
            retryDelayMs,
            () => cancelled,
            consumeWakeUp,
          );
          if (wasCancelled) break;
          continue;
        } finally {
          if (batchTimeoutId !== null) {
            clearTimeout(batchTimeoutId);
          }
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
          console.warn(
            '[A12Diag] loop terminando status=' + finalOutcome.status,
          );
          if (__DEV__) {
            console.log('[ForegroundIndex] loop saindo: cancelado');
          }
          break;
        }

        if (!outcome) {
          const wasCancelled = await waitOrCancel(
            10_000,
            () => cancelled,
            consumeWakeUp,
          );
          if (wasCancelled) break;
          continue;
        }

        if (outcome.status === 'waiting' || outcome.status === 'blocked') {
          console.warn(
            `[ForegroundIndex] Batch retornou ${outcome.status}; aguardando liberação...`,
          );
          const wasCancelled = await waitOrCancel(
            3_000,
            () => cancelled,
            consumeWakeUp,
          );
          if (wasCancelled) break;
          continue;
        }

        // Só atualiza a notificação enquanto o loop ainda está ativo.
        // Se o batch terminou (completed/cancelled), NÃO emitir — evita
        // recriar a notificação depois que stopIndexingForeground cancelar.
        if (outcome.status !== 'completed' && outcome.status !== 'cancelled') {
          void updateIndexingProgress(
            outcome.cumulativeProcessed,
            outcome.cumulativeTotal,
          );
        }
        if (outcome.status === 'completed' || outcome.status === 'cancelled') {
          console.warn(
            '[A12Diag] loop terminando status=' + outcome.status,
          );
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
      if (finalOutcome && currentOnFinalOutcome) {
        if (
          finalOutcome.status === 'completed' ||
          finalOutcome.status === 'cancelled'
        ) {
          // Deixa qualquer updateIndexingProgress pendente resolver antes
          // de notificar o estado final e encerrar o serviço.
          await new Promise<void>((resolve) => setTimeout(resolve, 300));
        }
        try {
          await currentOnFinalOutcome(finalOutcome);
          console.warn('[A12Diag] onFinalOutcome OK');
        } catch (error) {
          console.warn('[A12Diag] onFinalOutcome falhou', error);
        }
      }
    } finally {
      console.warn('[A12Diag] finally iniciado');
      // Delay extra para garantir que updates pendentes resolveram.
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      try {
        await stopIndexingForeground();
        console.warn('[A12Diag] stopIndexingForeground OK');
      } catch (error) {
        console.warn('[A12Diag] stopIndexingForeground falhou', error);
      }
      activeHandle = null;
      console.warn('[A12Diag] loop finalizado');
    }
  })();

  const handle: ForegroundIndexingHandle = {
    promise,
    cancel: () => {
      cancelled = true;
    },
    isRunning: () => !cancelled && activeHandle === handle,
    updateCallbacks: (nextOptions) => {
      if (nextOptions.onPartialProgress !== undefined) {
        currentOnPartialProgress = nextOptions.onPartialProgress;
        if (latestProgress) {
          nextOptions.onPartialProgress(
            latestProgress.processedAssets,
            latestProgress.totalAssets,
          );
        }
      }
      if (nextOptions.onFinalOutcome !== undefined) {
        currentOnFinalOutcome = nextOptions.onFinalOutcome;
      }
    },
    wakeUp: () => {
      wakeUpRequested = true;
    },
  };

  activeHandle = handle;
  return handle;
}

export async function runForegroundIndexLoopInternal(
  options: ForegroundIndexingOptions = {},
): Promise<void> {
  const handle = startForegroundIndexing(options);
  return handle.promise;
}