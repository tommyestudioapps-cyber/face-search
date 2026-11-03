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
        if (WakeLock.isIndexerPaused()) {
          console.warn('[Headless] pausa solicitada; interrompendo lote');
          throw new Error('paused-by-user');
        }
        void updateIndexingProgress(processed, total ?? 0);
      },
    });
    console.warn('[Headless] lote concluído');
  } catch (error) {
    if (error instanceof Error && error.message === 'paused-by-user') {
      console.warn('[Headless] lote interrompido por pausa');
    } else {
      console.warn('[Headless] lote falhou', error);
    }
  } finally {
    batchRunning = false;
    WakeLock.notifyHeadlessDone();
  }
}

async function runHeadlessBatch(): Promise<void> {
  console.warn('[Headless] task iniciada; rodando loop de indexação');
  try {
    const { runForegroundIndexLoopInternal } = await import('./foregroundIndexLoop');
    await runForegroundIndexLoopInternal({ allowServiceStart: false });
    console.warn('[Headless] loop headless encerrado');
  } catch (error) {
    console.warn('[Headless] loop headless falhou', error);
  } finally {
    WakeLock.notifyHeadlessDone();
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
