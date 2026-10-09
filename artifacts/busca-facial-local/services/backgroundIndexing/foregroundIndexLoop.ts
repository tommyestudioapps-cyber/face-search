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
      let loopIteration = 0;
      while (!cancelled) {
        loopIteration += 1;
        console.warn(`[LoopDiag] iter=${loopIteration} inicio`);
        console.warn(`[LoopDiag] iter=${loopIteration} antes-consent`);
        const consent = await getBackgroundIndexConsent();
        console.warn(`[LoopDiag] iter=${loopIteration} depois-consent consent=${consent}`);
        if (consent !== 'accepted') {
          console.warn(`[LoopDiag] iter=${loopIteration} saindo: consent=${consent}`);
          if (__DEV__) {
            console.log(`[ForegroundIndex] loop saindo: consent=${consent}`);
          }
          break;
        }

        // NÃO checamos AppState aqui. O foreground service mantém o processo
        // vivo mesmo em background, então o loop deve continuar rodando.
        // A única forma de parar é via cancelamento explícito, consentimento
        // revogado ou status terminal (logo abaixo).
        console.warn(`[LoopDiag] iter=${loopIteration} antes-batch`);
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
        console.warn(`[LoopDiag] iter=${loopIteration} depois-batch`);

        if (cancelled) {
          console.warn(`[LoopDiag] iter=${loopIteration} saindo: cancelado`);
          if (__DEV__) {
            console.log('[ForegroundIndex] loop saindo: cancelado');
          }
          break;
        }

        console.warn(`[LoopDiag] iter=${loopIteration} antes-getState`);
        const state = await faceSearchRepository.getBackgroundIndexState();
        console.warn(
          `[LoopDiag] iter=${loopIteration} depois-getState status=${state.status} processed=${state.processedAssets}`,
        );
        if (options.onProgress) {
          console.warn(`[LoopDiag] iter=${loopIteration} antes-onProgress`);
          await options.onProgress(state);
          console.warn(`[LoopDiag] iter=${loopIteration} depois-onProgress`);
        }
        console.warn(`[LoopDiag] iter=${loopIteration} antes-updateNotif`);
        void updateIndexingProgress(
          state.processedAssets,
          state.totalAssets,
        );
        console.warn(`[LoopDiag] iter=${loopIteration} fim`);
        if (
          state.status === 'completed' ||
          state.status === 'error' ||
          state.status === 'cancelled'
        ) {
          console.warn(`[LoopDiag] iter=${loopIteration} saindo: status=${state.status}`);
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