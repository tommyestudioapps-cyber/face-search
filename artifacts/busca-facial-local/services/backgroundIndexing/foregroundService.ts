import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
  AuthorizationStatus,
  EventType,
} from '@notifee/react-native';
import { WakeLock } from '../../modules/wake-lock';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const INDEXING_CHANNEL_ID = 'search-face-indexing';
export const INDEXING_NOTIFICATION_ID = 'search-face-indexing-foreground';
export const INDEXING_PAUSE_ACTION = 'search-face-pause-indexing';

const NOTIF_ASKED_KEY = 'visage.notifPermissionAsked';
const BATTERY_EXEMPTION_ASKED_KEY = 'visage.batteryOptimizationAsked';

export function isIgnoringBatteryOptimizations(): boolean {
  if (Platform.OS !== 'android') return true;
  if (typeof WakeLock.isIgnoringBatteryOptimizations !== 'function') {
    return false;
  }
  return WakeLock.isIgnoringBatteryOptimizations();
}

export function requestBatteryOptimizationExemption(): boolean {
  if (Platform.OS !== 'android') return true;
  if (typeof WakeLock.requestIgnoreBatteryOptimizations !== 'function') {
    return false;
  }
  return WakeLock.requestIgnoreBatteryOptimizations();
}

export function openBatteryOptimizationSettings(): boolean {
  if (Platform.OS !== 'android') return false;
  if (typeof WakeLock.openBatteryOptimizationSettings !== 'function') {
    return false;
  }
  return WakeLock.openBatteryOptimizationSettings();
}

export async function ensureBatteryOptimizationExemptionAsked(
  force = false,
): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (isIgnoringBatteryOptimizations()) {
    return true;
  }
  if (!force) {
    return false;
  }
  try {
    await AsyncStorage.setItem(BATTERY_EXEMPTION_ASKED_KEY, 'true');
  } catch (error) {
    console.warn('[Battery] falha ao gravar flag de isenção', error);
  }
  requestBatteryOptimizationExemption();
  return isIgnoringBatteryOptimizations();
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) {
    return true;
  }
  try {
    const settings = await notifee.getNotificationSettings();
    return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
  } catch {
    return false;
  }
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) {
    return true;
  }
  let granted = false;
  try {
    const settings = await notifee.requestPermission();
    granted =
      settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
  } catch (error) {
    console.warn('[Notif] falha ao pedir permissão', error);
    granted = false;
  }
  try {
    await AsyncStorage.setItem(NOTIF_ASKED_KEY, 'true');
  } catch (error) {
    console.warn('[Notif] falha ao gravar flag', error);
  }
  return granted;
}

async function readNotificationAskedFlag(): Promise<boolean | null> {
  try {
    const value = await AsyncStorage.getItem(NOTIF_ASKED_KEY);
    return value === 'true';
  } catch (error) {
    console.warn('[Notif] falha ao ler flag', error);
    return null;
  }
}

export async function ensureNotificationPermissionAsked(): Promise<{
  granted: boolean;
  shouldShowWarning: boolean;
}> {
  if (
    Platform.OS !== 'android' ||
    (typeof Platform.Version === 'number' && Platform.Version < 33)
  ) {
    return { granted: true, shouldShowWarning: false };
  }
  if (await hasNotificationPermission()) {
    return { granted: true, shouldShowWarning: false };
  }
  const asked = await readNotificationAskedFlag();
  if (asked === null || asked) {
    return { granted: false, shouldShowWarning: true };
  }
  const granted = await requestNotificationPermission();
  return { granted, shouldShowWarning: !granted };
}

let pauseHandler: (() => void) | null = null;

notifee.registerForegroundService(async () => {
  console.warn('[ForegroundService] Headless task executor acionado pelo Notifee!');
  try {
    const { runForegroundIndexLoopInternal } = await import('./foregroundIndexLoop');
    await runForegroundIndexLoopInternal();
  } catch (error) {
    console.warn('[ForegroundService] Erro no loop da headless task:', error);
  } finally {
    console.warn('[ForegroundService] Headless task executor finalizado.');
  }
});

// Auto-retomada em segundo plano quando o motor JS é inicializado
// (cobre ressurreição do processo pelo Android/ColorOS sem Activity montada).
void (async () => {
  try {
    const { getBackgroundIndexConsent } = await import('./consent');
    const consent = await getBackgroundIndexConsent();
    if (consent !== 'accepted') return;

    const { getBackgroundIndexState } = await import('../faceSearch');
    const state = await getBackgroundIndexState();
    if (
      state.status === 'completed' ||
      state.status === 'cancelled' ||
      state.status === 'paused'
    ) {
      return;
    }

    const { WakeLock } = await import('../../modules/wake-lock');
    if (!WakeLock.hasAnyGalleryPermission()) return;

    console.warn(
      `[ForegroundService] Auto-retomando indexação no boot do JS (status=${state.status}, fotos=${state.processedAssets}/${state.totalAssets ?? '?'})...`,
    );
    const { startForegroundIndexing } = await import('./foregroundIndexLoop');
    startForegroundIndexing();
  } catch (err) {
    console.warn('[ForegroundService] Falha na auto-retomada no boot do JS:', err);
  }
})();

export function registerPauseHandler(handler: () => void): () => void {
  pauseHandler = handler;
  return () => {
    if (pauseHandler === handler) pauseHandler = null;
  };
}

function handlePauseAction(): void {
  if (pauseHandler) {
    pauseHandler();
  } else {
    void (async () => {
      try {
        const mod = await import('./foregroundIndexLoop');
        mod.getActiveForegroundIndexing()?.cancel();
      } catch {
        // ignore
      }
    })();
  }
}

notifee.onForegroundEvent(({ type, detail }) => {
  if (
    type === EventType.ACTION_PRESS &&
    detail.pressAction?.id === INDEXING_PAUSE_ACTION
  ) {
    handlePauseAction();
  }
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (
    type === EventType.ACTION_PRESS &&
    detail.pressAction?.id === INDEXING_PAUSE_ACTION
  ) {
    handlePauseAction();
  }
});

export async function ensureIndexingChannel(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  return notifee.createChannel({
    id: INDEXING_CHANNEL_ID,
    name: 'Preparação do índice',
    importance: AndroidImportance.LOW,
    description: 'Progresso da preparação automática do índice local.',
  });
}

export async function startIndexingForeground(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await ensureIndexingChannel();
  // Wake lock de 10 min, renovado a cada 5 min se a indexação ainda estiver ativa.
  // Sem isso, a CPU suspende (mWakefulness=Dozing) e os timers JS congelam.
  const acquired = WakeLock.acquire(10 * 60 * 1000);
  const batteryExempt = isIgnoringBatteryOptimizations();
  console.warn(
    `[WakeLock] startIndexingForeground acquired=${acquired} batteryExempt=${batteryExempt}`,
  );
  try {
    await notifee.displayNotification({
      id: INDEXING_NOTIFICATION_ID,
      title: 'Preparando índice local',
      body: 'Search Face está analisando suas fotos em segundo plano.',
      android: {
        channelId: INDEXING_CHANNEL_ID,
        smallIcon: 'ic_notification',
        asForegroundService: true,
        foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
        ongoing: true,
        onlyAlertOnce: true,
        progress: {
          max: 100,
          current: 0,
          indeterminate: true,
        },
        pressAction: { id: 'default' },
        actions: [
          {
            title: 'Pausar',
            pressAction: { id: INDEXING_PAUSE_ACTION },
          },
        ],
      },
    });
  } catch (error) {
    try {
      WakeLock.release();
    } catch (releaseError) {
      console.warn('[Indexing] falha ao liberar wake lock após erro de notificação', releaseError);
    }
    throw error;
  }
}

let lastNotificationUpdateAt = 0;

export async function updateIndexingProgress(
  processedAssets: number,
  totalAssets: number | null,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Renova o wake lock a cada update (~2s por batch). O acquire substitui
  // o anterior, então não há leak. Timeout de 10 min garante liberação
  // se o app crashar sem chamar stop.
  WakeLock.acquire(10 * 60 * 1000);
  const now = Date.now();
  const isComplete =
    typeof totalAssets === 'number' &&
    totalAssets > 0 &&
    processedAssets >= totalAssets;
  if (!isComplete && now - lastNotificationUpdateAt < 2_000) {
    return;
  }
  lastNotificationUpdateAt = now;
  const hasTotal =
    typeof totalAssets === 'number' && totalAssets > 0;
  const safeMax = hasTotal ? totalAssets : 100;
  const safeCurrent = hasTotal
    ? Math.min(processedAssets, safeMax)
    : 0;
  const body = hasTotal
    ? `Analisando ${processedAssets} de ${totalAssets} fotos…`
    : `Analisando ${processedAssets} fotos…`;
  await notifee.displayNotification({
    id: INDEXING_NOTIFICATION_ID,
    title: 'Preparando índice local',
    body,
    android: {
      channelId: INDEXING_CHANNEL_ID,
      smallIcon: 'ic_notification',
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
      ongoing: true,
      onlyAlertOnce: true,
      progress: {
        max: safeMax,
        current: safeCurrent,
        indeterminate: !hasTotal,
      },
      pressAction: { id: 'default' },
      actions: [
        {
          title: 'Pausar',
          pressAction: { id: INDEXING_PAUSE_ACTION },
        },
      ],
    },
  });
}

export async function stopIndexingForeground(): Promise<void> {
  if (Platform.OS !== 'android') return;
  WakeLock.release();
  console.warn('[A12Diag] stopIndexingForeground iniciando');
  try {
    await notifee.stopForegroundService();
    console.warn('[A12Diag] notifee.stopForegroundService OK');
  } catch (error) {
    console.warn('[A12Diag] notifee.stopForegroundService falhou', error);
  }
  try {
    await notifee.cancelNotification(INDEXING_NOTIFICATION_ID);
    console.warn('[A12Diag] notifee.cancelNotification OK');
  } catch (error) {
    console.warn('[A12Diag] notifee.cancelNotification falhou', error);
  }
  // Segunda tentativa: garante que uma notificação recriada por update
  // pendente seja também cancelada.
  try {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    await notifee.cancelNotification(INDEXING_NOTIFICATION_ID);
    console.warn('[A12Diag] notifee.cancelNotification (2a) OK');
  } catch (error) {
    console.warn('[A12Diag] notifee.cancelNotification (2a) falhou', error);
  }
}
