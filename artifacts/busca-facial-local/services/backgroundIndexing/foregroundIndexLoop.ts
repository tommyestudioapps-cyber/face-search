import { AppState } from 'react-native';
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
    try {
      while (!cancelled) {
        const consent = await getBackgroundIndexConsent();
        if (consent !== 'accepted') break;

        if (AppState.currentState !== 'active') break;

        try {
          await runBackgroundIndexBatch({
            maxAssets,
            timeBudgetMs,
            onPartialProgress: options.onPartialProgress,
          });
        } catch (error) {
          console.warn('[ForegroundIndex] batch falhou', error);
          break;
        }

        if (cancelled) break;

        const state = await faceSearchRepository.getBackgroundIndexState();
        if (options.onProgress) {
          await options.onProgress(state);
        }
        if (
          state.status === 'completed' ||
          state.status === 'error' ||
          state.status === 'cancelled'
        ) {
          break;
        }
      }
    } finally {
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