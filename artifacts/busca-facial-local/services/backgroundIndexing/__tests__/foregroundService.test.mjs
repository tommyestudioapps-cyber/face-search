import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const platform = { OS: 'android' };
let acquireCalls = 0;
let releaseCalls = 0;
let releaseFailure = null;
let batteryExempt = false;
let requestExemptionCalls = 0;
let startIndexerCalls = 0;
let updateProgressCalls = [];
let stopIndexerCalls = 0;
let isPaused = false;

const notifeeMock = {
  registerForegroundService: () => {},
  onForegroundEvent: () => {},
  onBackgroundEvent: () => {},
  createChannel: async () => 'search-face-indexing',
  displayNotification: async () => {},
  stopForegroundService: async () => {},
  cancelNotification: async () => {},
};

const wakeLockMock = {
  acquire: () => {
    acquireCalls += 1;
    return true;
  },
  release: () => {
    releaseCalls += 1;
    if (releaseFailure) throw releaseFailure;
    return true;
  },
  isIgnoringBatteryOptimizations: () => batteryExempt,
  requestIgnoreBatteryOptimizations: () => {
    requestExemptionCalls += 1;
    return true;
  },
  startIndexer: () => {
    startIndexerCalls += 1;
    return true;
  },
  updateIndexerProgress: (processed, total) => {
    updateProgressCalls.push({ processed, total });
    return true;
  },
  stopIndexer: () => {
    stopIndexerCalls += 1;
    return true;
  },
  isIndexerPaused: () => isPaused,
};

mock.module('react-native', {
  cache: true,
  namedExports: { Platform: platform },
});
mock.module('@notifee/react-native', {
  cache: true,
  defaultExport: notifeeMock,
  namedExports: {
    AndroidForegroundServiceType: {
      FOREGROUND_SERVICE_TYPE_DATA_SYNC: 1,
    },
    AndroidImportance: { LOW: 1 },
    AuthorizationStatus: { AUTHORIZED: 1 },
    EventType: { ACTION_PRESS: 1 },
  },
});
mock.module('@react-native-async-storage/async-storage', {
  cache: true,
  defaultExport: {
    getItem: async () => null,
    setItem: async () => {},
  },
});
mock.module(new URL('../../../modules/wake-lock/index.ts', import.meta.url), {
  cache: true,
  namedExports: { WakeLock: wakeLockMock },
});

const {
  startIndexingForeground,
  updateIndexingProgress,
  stopIndexingForeground,
} = await import('../foregroundService.ts');

function resetMocks() {
  acquireCalls = 0;
  releaseCalls = 0;
  releaseFailure = null;
  batteryExempt = false;
  requestExemptionCalls = 0;
  startIndexerCalls = 0;
  updateProgressCalls = [];
  stopIndexerCalls = 0;
  isPaused = false;
}

test('startIndexingForeground adquire o wake lock e despacha o indexador nativo', async () => {
  resetMocks();
  await startIndexingForeground();

  assert.equal(acquireCalls, 1);
  assert.equal(startIndexerCalls, 1);
});

test('updateIndexingProgress delega o progresso para o serviço nativo', async () => {
  resetMocks();
  await updateIndexingProgress(42, 100);

  assert.equal(updateProgressCalls.length, 1);
  assert.deepEqual(updateProgressCalls[0], { processed: 42, total: 100 });
});

test('stopIndexingForeground para o indexador nativo e libera o wake lock', async () => {
  resetMocks();
  await stopIndexingForeground();

  assert.equal(stopIndexerCalls, 1);
  assert.equal(releaseCalls, 1);
});
