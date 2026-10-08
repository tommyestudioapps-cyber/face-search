import { AppState } from 'react-native';
import {
  registerPauseHandler,
  startIndexingForeground,
  stopIndexingForeground,
  updateIndexingProgress,
} from './foregroundService';
import { runBackgroundIndexBatch } from './batchRunner';
import { getBackgroundIndexConsent } from './consent';
import { faceSearchRepository } from '../faceSearch/repository';
import type { BackgroundIndexState } from './status';

export interface ForegroundIndexingHandle {
  promise: Promise<void>;
  cancel: () => void;
  isRunning: () => boolean;
}

export interface ForegroundIndexingOptions {
  maxAssets?: number;
  timeBudgetMs?: number;
  onProgress?: (state: BackgroundIndexState) => void | Promise<void>;
  onPartialProgress?: (processedAssets: number, totalAssets: number | null) => void;
}

const DEFAULT_MAX_ASSETS = 500;
const DEFAULT_TIME_BUDGET_MS = 120_000;

let activeHandle: ForegroundIndexingHandle | null = null;

export function getActiveForegroundIndexing(): ForegroundIndexingHandle | null {
  return activeHandle;
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
      while (!cancelled) {
        const consent = await getBackgroundIndexConsent();
        if (consent !== 'accepted') {
          if (__DEV__) {
            console.log(`[ForegroundIndex] loop saindo: consent=${consent}`);
          }
          break;
        }

        if (AppState.currentState !== 'active') {
          if (__DEV__) {
            console.log(
              `[ForegroundIndex] loop saindo: AppState=${AppState.currentState}`,
            );
          }
          break;
        }

        try {
          await runBackgroundIndexBatch({
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

        if (cancelled) {
          if (__DEV__) {
            console.log('[ForegroundIndex] loop saindo: cancelado');
          }
          break;
        }

        const state = await faceSearchRepository.getBackgroundIndexState();
        if (options.onProgress) {
          await options.onProgress(state);
        }
        void updateIndexingProgress(
          state.processedAssets,
          state.totalAssets,
        );
        if (
          state.status === 'completed' ||
          state.status === 'error' ||
          state.status === 'cancelled'
        ) {
          if (__DEV__) {
            console.log(
              `[ForegroundIndex] loop saindo: status=${state.status}`,
            );
          }
          break;
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