import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const appState = { currentState: 'active' };
let consent = 'accepted';
let backgroundState = { status: 'completed' };
let runBatch = async () => {};
const batchCalls = [];

mock.module('react-native', {
  cache: true,
  namedExports: { AppState: appState },
});
mock.module(new URL('../batchRunner.ts', import.meta.url), {
  cache: true,
  namedExports: {
    runBackgroundIndexBatch: async (options) => {
      batchCalls.push(options);
      return runBatch(options);
    },
  },
});
mock.module(new URL('../consent.ts', import.meta.url), {
  cache: true,
  namedExports: {
    getBackgroundIndexConsent: async () => consent,
  },
});
mock.module(new URL('../../faceSearch/repository.ts', import.meta.url), {
  cache: true,
  namedExports: {
    faceSearchRepository: {
      getBackgroundIndexState: async () => backgroundState,
    },
  },
});

const {
  getActiveForegroundIndexing,
  startForegroundIndexing,
} = await import('../foregroundIndexLoop.ts');

function resetState() {
  appState.currentState = 'active';
  consent = 'accepted';
  backgroundState = { status: 'completed' };
  runBatch = async () => {};
  batchCalls.length = 0;
}

test('usa os limites padrão e retorna o handle ativo em chamadas duplicadas', async () => {
  resetState();
  backgroundState = { status: 'completed' };

  const handle = startForegroundIndexing();
  assert.equal(startForegroundIndexing(), handle);
  assert.equal(getActiveForegroundIndexing(), handle);
  assert.equal(handle.isRunning(), true);

  await handle.promise;

  assert.deepEqual(batchCalls, [{
    maxAssets: 500,
    timeBudgetMs: 120_000,
  }]);
  assert.equal(handle.isRunning(), false);
  assert.equal(getActiveForegroundIndexing(), null);
});

test('continua após lote pausado e repassa os limites personalizados', async () => {
  resetState();
  let stateReads = 0;
  backgroundState = { status: 'paused' };
  const repositoryMock = await import('../../faceSearch/repository.ts');
  repositoryMock.faceSearchRepository.getBackgroundIndexState = async () => {
    stateReads += 1;
    if (stateReads === 2) backgroundState = { status: 'completed' };
    return backgroundState;
  };

  const handle = startForegroundIndexing({
    maxAssets: 720,
    timeBudgetMs: 180_000,
  });
  await handle.promise;

  assert.equal(batchCalls.length, 2);
  assert.deepEqual(batchCalls, [
    { maxAssets: 720, timeBudgetMs: 180_000 },
    { maxAssets: 720, timeBudgetMs: 180_000 },
  ]);
});

test('não inicia lote sem consentimento ou quando o app não está ativo', async () => {
  resetState();
  consent = 'declined';

  const declinedHandle = startForegroundIndexing();
  await declinedHandle.promise;
  assert.equal(batchCalls.length, 0);

  consent = 'accepted';
  appState.currentState = 'background';
  const backgroundHandle = startForegroundIndexing();
  await backgroundHandle.promise;
  assert.equal(batchCalls.length, 0);
});

test('cancelar durante um lote impede a próxima iteração', async () => {
  resetState();
  backgroundState = { status: 'paused' };

  let signalBatchStarted;
  const batchStarted = new Promise((resolve) => {
    signalBatchStarted = resolve;
  });
  let finishBatch;
  const pendingBatch = new Promise((resolve) => {
    finishBatch = resolve;
  });
  runBatch = async () => {
    signalBatchStarted();
    await pendingBatch;
  };

  const handle = startForegroundIndexing();
  await batchStarted;
  handle.cancel();
  finishBatch();
  await handle.promise;

  assert.equal(batchCalls.length, 1);
  assert.equal(handle.isRunning(), false);
  assert.equal(getActiveForegroundIndexing(), null);
});