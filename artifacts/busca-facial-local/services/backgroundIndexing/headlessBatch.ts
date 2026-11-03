import { AppRegistry } from 'react-native';
import { WakeLock } from '../../modules/wake-lock';
import {
  startIndexingForeground,
  stopIndexingForeground,
  updateIndexingProgress,
} from './foregroundService';

export const HEADLESS_INDEX_TASK = 'IndexingBatch';

let batchRunning = false;

/** Roda apenas o lote (sem tocar no card). Usada pelo executor do Notifee. */
export async function runIndexBatchHeadless(): Promise<void> {
  if (batchRunning) {
    console.warn('[Headless] lote já em execução; ignorando chamada');
    return;
  }
  batchRunning = true;
  try {
    const { runBackgroundIndexBatch } = await import('./batchRunner');
    await runBackgroundIndexBatch({
      maxAssets: 200,
      timeBudgetMs: 120_000,
      trigger: 'explicit',
      onPartialProgress: (processed, total) => {
        void updateIndexingProgress(processed, total ?? 0);
      },
    });
    console.warn('[Headless] lote concluído');
  } catch (error) {
    console.warn('[Headless] lote falhou', error);
  } finally {
    batchRunning = false;
  }
}

async function runHeadlessBatch(): Promise<void> {
  console.warn('[Headless] lote iniciado');

  let ownsCard = false;
  try {
    await startIndexingForeground();
    ownsCard = true;
    WakeLock.clearRevivalNotification?.();
    console.warn('[Headless] card de progresso assumido');
  } catch (error) {
    console.warn('[Headless] não foi possível assumir o card; seguindo sem ele', error);
  }

  try {
    await runIndexBatchHeadless();
  } finally {
    if (ownsCard) {
      try {
        await stopIndexingForeground();
      } catch (error) {
        console.warn('[Headless] falha ao encerrar card', error);
      }
    }
  }
}

/**
 * Chamada no boot do JS. Só age quando o processo nasceu sem Activity
 * (ex.: serviço do Notifee reiniciado após swipe) e há consentimento.
 */
export async function maybeResumeIndexingOnBoot(delayMs = 3000): Promise<void> {
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

    const { AppState } = await import('react-native');
    if (AppState.currentState === 'active') {
      return;
    }

    const { getActiveForegroundIndexing } = await import('./foregroundIndexLoop');
    if (getActiveForegroundIndexing()?.isRunning()) {
      return;
    }

    const { getBackgroundIndexConsent } = await import('./consent');
    if ((await getBackgroundIndexConsent()) !== 'accepted') {
      return;
    }

    const { hasGalleryPhotoPermission } = await import('./galleryPermission');
    if (!(await hasGalleryPhotoPermission())) {
      return;
    }

    console.warn('[Headless] boot sem Activity: retomando lote');
    await runIndexBatchHeadless();
  } catch (error) {
    console.warn('[Headless] falha no gatilho de boot', error);
  }
}

AppRegistry.registerHeadlessTask(HEADLESS_INDEX_TASK, () => runHeadlessBatch);
