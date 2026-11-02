import { AppRegistry } from 'react-native';

export const HEADLESS_INDEX_TASK = 'IndexingBatch';

async function runHeadlessBatch(): Promise<void> {
  const { runBackgroundIndexBatch } = await import('./batchRunner');
  console.warn('[Headless] lote iniciado');
  try {
    await runBackgroundIndexBatch({
      maxAssets: 200,
      timeBudgetMs: 120_000,
      trigger: 'explicit',
    });
    console.warn('[Headless] lote concluído');
  } catch (error) {
    console.warn('[Headless] lote falhou', error);
  }
}

AppRegistry.registerHeadlessTask(HEADLESS_INDEX_TASK, () => runHeadlessBatch);
