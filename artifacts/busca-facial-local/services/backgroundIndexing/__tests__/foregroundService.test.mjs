import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

const platform = { OS: 'android' };
let displayNotification = async () => {};
let acquireCalls = 0;
let releaseCalls = 0;
let releaseFailure = null;
let batteryExempt = false;
let requestExemptionCalls = 0;

const notifeeMock = {
  registerForegroundService: () => {},
  onForegroundEvent: () => {},
  onBackgroundEvent: () => {},
  createChannel: async () => 'search-face-indexing',
  displayNotification: (...args) => displayNotification(...args),
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
  ensureBatteryOptimizationExemptionAsked,
} = await import('../foregroundService.ts');

function resetMocks() {
  displayNotification = async () => {};
  acquireCalls = 0;
  releaseCalls = 0;
  releaseFailure = null;
  batteryExempt = false;
  requestExemptionCalls = 0;
}

test('libera o wake lock e permite nova inicialização após falha da notificação', async () => {
  resetMocks();
  const notificationError = new Error('notification unavailable');
  displayNotification = async () => {
    throw notificationError;
  };

  await assert.rejects(
    startIndexingForeground(),
    (error) => error === notificationError,
  );
  assert.equal(releaseCalls, 1);

  displayNotification = async () => {};
  await startIndexingForeground();

  assert.equal(acquireCalls, 2);
  assert.equal(releaseCalls, 1);
});

test('preserva o erro da notificação se a liberação do wake lock também falhar', async () => {
  resetMocks();
  const notificationError = new Error('notification unavailable');
  releaseFailure = new Error('wake lock release failed');
  displayNotification = async () => {
    throw notificationError;
  };

  await assert.rejects(
    startIndexingForeground(),
    (error) => error === notificationError,
  );
  assert.equal(releaseCalls, 1);
});
