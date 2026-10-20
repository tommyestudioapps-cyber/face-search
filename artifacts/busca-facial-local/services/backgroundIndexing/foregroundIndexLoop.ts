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
import { AppState } from 'react-native';

export interface ForegroundIndexingHandle {
  promise: Promise<void>;
  cancel: () => void;
  isRunning: () => boolean;
  updateCallbacks: (options: ForegroundIndexingOptions) => void;
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
): Promise<boolean> {
  const step = 500;
  const iterations = Math.ceil(ms / step);
  for (let i = 0; i < iterations; i += 1) {
    if (isCancelled()) return true;
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
  if (AppState.currentState !== 'active') {
    console.warn('[ForegroundIndex] abortando: app não está em foreground');
    return createInactiveHandle();
  }
  if (activeHandle && activeHandle.isRunning()) {
    // Handle ativo: substituir callbacks para que a nova tela (após
    // remontagem) receba eventos a partir de agora. Sem isso, a UI nova
    // fica presa no snapshot do SQLite enquanto a notificação continua
    // avançando.
    activeHandle.updateCallbacks(options);
    return activeHandle;
  }

  const maxAssets = options.maxAssets ?? DEFAULT_MAX_ASSETS;
  const timeBudgetMs = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;

  let cancelled = false;
  // Refs mutáveis para os callbacks — permitem substituição em runtime
  // quando a tela é remontada sem matar o handle.
  let currentOnPartialProgress = options.onPartialProgress;
  let currentOnFinalOutcome = options.onFinalOutcome;

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
        let abortHungBatch: (() => void) | null = null;
        const BATCH_HARD_TIMEOUT_MS = 5 * 60 * 1000;
        const batchPromise = runBackgroundIndexBatch({
          maxAssets,
          timeBudgetMs,
          trigger: options.trigger,
          registerAbortHandler: (abort) => {
            abortHungBatch = abort;
          },
          onPartialProgress: (processedAssets, totalAssets) => {
            currentOnPartialProgress?.(processedAssets, totalAssets);
            void updateIndexingProgress(processedAssets, totalAssets);
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          batchTimeoutId = setTimeout(() => {
            batchTimedOut = true;
            reject(new Error('batch hard timeout'));
          }, BATCH_HARD_TIMEOUT_MS);
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
          // para sempre. 5 erros consecutivos = 5 * 70s ≈ 6 minutos.
          if (consecutiveBatchErrors >= 5) {
            console.warn(
              `[ForegroundIndex] abortando após ${consecutiveBatchErrors} erros consecutivos`,
            );
            break;
          }
          // Em background, o watchdog (B3) não pode reiniciar. O while precisa
          // sobreviver ao timeout e continuar. 70s > SCAN_LEASE_MS (60s) com
          // margem, para o próximo claimScan ter sucesso mesmo se o lease
          // foi renovado segundos antes.
          const wasCancelled = await waitOrCancel(70_000, () => cancelled);
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
          const wasCancelled = await waitOrCancel(30_000, () => cancelled);
          if (wasCancelled) break;
          continue;
        }

        if (outcome.status === 'waiting' || outcome.status === 'blocked') {
          finalOutcome = outcome;
          break;
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
      }
      if (nextOptions.onFinalOutcome !== undefined) {
        currentOnFinalOutcome = nextOptions.onFinalOutcome;
      }
    },
  };

  activeHandle = handle;
  return handle;
}