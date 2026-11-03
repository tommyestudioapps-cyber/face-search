import notifee, {
  AndroidForegroundServiceType,
  AndroidImportance,
  AuthorizationStatus,
  EventType,
} from '@notifee/react-native';
import { WakeLock } from '../../modules/wake-lock';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState } from 'react-native';

export const INDEXING_CHANNEL_ID = 'search-face-indexing-v2';
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
let isNotificationDismissedByUser = false;
let lastProcessedAssets = 0;
let lastTotalAssets: number | null = null;
let lastNotificationUpdateAt = 0;

export function restoreIndexingNotification(): void {
  if (Platform.OS !== 'android') return;
  if (!isNotificationDismissedByUser) return;
  console.warn('[ForegroundService] App aberto pelo usuário; restaurando exibição da notificação.');
  isNotificationDismissedByUser = false;
  lastNotificationUpdateAt = 0;
  void (async () => {
    try {
      const { getActiveForegroundIndexing } = await import('./foregroundIndexLoop');
      if (getActiveForegroundIndexing()?.isRunning()) {
        await updateIndexingProgress(lastProcessedAssets, lastTotalAssets);
      }
    } catch (err) {
      console.warn('[ForegroundService] Falha ao restaurar notificação:', err);
    }
  })();
}

if (Platform.OS === 'android' && AppState?.addEventListener) {
  AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      restoreIndexingNotification();
    }
  });
}

notifee.registerForegroundService(async (notification) => {
  console.warn('[ForegroundService] executor headless acionado; reexibindo notificação.');
  try {
    if (notification) {
      await notifee.displayNotification(notification);
    } else {
      await reviveIndexingNotification('headless');
    }
  } catch (error) {
    console.warn('[ForegroundService] falha no executor headless', error);
  }

  // Retomada sem Activity: só quando o app NÃO está na tela e nenhum loop está ativo.
  try {
    if (AppState.currentState === 'active') {
      return;
    }
    const { getActiveForegroundIndexing } = await import('./foregroundIndexLoop');
    if (getActiveForegroundIndexing()?.isRunning()) {
      return;
    }
    const { runIndexBatchHeadless } = await import('./headlessBatch');
    console.warn('[ForegroundService] executor: retomando lote sem Activity');
    void runIndexBatchHeadless();
  } catch (error) {
    console.warn('[ForegroundService] falha ao retomar lote pelo executor', error);
  }
});

// Auto-retomada quando o processo principal renasce via reactHost.start() sem MainActivity (pós-swipe)
if (Platform.OS === 'android') {
  setTimeout(() => {
    if (AppState?.currentState === 'active') return; // Se a UI está aberta, o index.tsx já é o dono
    void (async () => {
      try {
        const { getActiveForegroundIndexing, startForegroundIndexing } = await import('./foregroundIndexLoop');
        if (getActiveForegroundIndexing()?.isRunning()) return;
        const { faceSearchRepository } = await import('@/services/faceSearch/repository');
        const { loadBackgroundIndexCursor } = await import('./checkpoint');
        const [state, checkpoint] = await Promise.all([
          faceSearchRepository.getBackgroundIndexState(),
          loadBackgroundIndexCursor(),
        ]);
        if (state.status === 'running' || Boolean(checkpoint)) {
          console.warn('[ForegroundService] Boot em background detectado com indexação pendente; retomando loop...');
          startForegroundIndexing();
        }
      } catch (err) {
        console.warn('[ForegroundService] Falha na checagem de auto-retomada em background:', err);
      }
    })();
  }, 1500);
}

// Registra ouvinte nativo para desbloqueio da tela (USER_PRESENT), carregador (POWER_CONNECTED) e revive pós-swipe
if (typeof WakeLock.addDeviceWakeListener === 'function') {
  WakeLock.addDeviceWakeListener((event) => {
    console.warn('[ForegroundService] Evento de wake/revive nativo recebido:', event.action);
    void (async () => {
      try {
        const { getActiveForegroundIndexing, startForegroundIndexing } = await import('./foregroundIndexLoop');
        const active = getActiveForegroundIndexing();
        if (active && active.isRunning()) {
          await reviveIndexingNotification('wake');
          active.wakeUp?.();
        } else {
          await reviveIndexingNotification('wake-sem-loop');
          startForegroundIndexing();
        }
      } catch (err) {
        console.warn('[ForegroundService] Erro ao retomar indexação via wake listener:', err);
      }
    })();
  });
}

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
  } else if (
    type === EventType.DISMISSED &&
    detail.notification?.id === INDEXING_NOTIFICATION_ID
  ) {
    console.warn('[ForegroundService] Notificação dispensada pelo usuário (foreground). Silenciando barra.');
    isNotificationDismissedByUser = true;
  }
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (
    type === EventType.ACTION_PRESS &&
    detail.pressAction?.id === INDEXING_PAUSE_ACTION
  ) {
    handlePauseAction();
  } else if (
    type === EventType.DISMISSED &&
    detail.notification?.id === INDEXING_NOTIFICATION_ID
  ) {
    console.warn('[ForegroundService] Notificação dispensada pelo usuário (background). Silenciando barra.');
    isNotificationDismissedByUser = true;
  }
});

export async function ensureIndexingChannel(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  try {
    await notifee.deleteChannel('search-face-indexing');
  } catch (error) {
    console.warn('[ForegroundService] falha ao apagar canal legado', error);
  }
  return notifee.createChannel({
    id: INDEXING_CHANNEL_ID,
    name: 'Preparação do índice',
    importance: AndroidImportance.DEFAULT,
    description: 'Progresso da preparação automática do índice local.',
  });
}

export async function startIndexingForeground(): Promise<void> {
  if (Platform.OS !== 'android') return;
  isNotificationDismissedByUser = false;
  lastNotificationUpdateAt = 0;
  await ensureIndexingChannel();
  WakeLock.clearRevivalNotification?.();
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
      title: 'Criando catálogo local',
      body: 'Iniciando análise da galeria...',
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

export async function updateIndexingProgress(
  processedAssets: number,
  totalAssets: number | null,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  lastProcessedAssets = processedAssets;
  lastTotalAssets = totalAssets;

  // Se o usuário dispensou a notificação da barra via swipe, respeitamos o silêncio visual
  // mantendo o processamento em segundo plano sem recriar o card na barra.
  if (isNotificationDismissedByUser) {
    return;
  }

  const now = Date.now();
  const isComplete =
    typeof totalAssets === 'number' &&
    totalAssets > 0 &&
    processedAssets >= totalAssets;
  if (isComplete || now - lastNotificationUpdateAt < 3_000) {
    return;
  }
  lastNotificationUpdateAt = now;

  // Renova o wake lock apenas a cada emissão de notificação (a cada 3s).
  WakeLock.acquire(10 * 60 * 1000);
  const hasTotal = typeof totalAssets === 'number' && totalAssets > 0;
  const percent = hasTotal
    ? Math.min(100, Math.max(0, Math.floor((processedAssets / totalAssets) * 100)))
    : 0;

  const body = hasTotal
    ? `Progresso: ${percent}% concluído (${processedAssets}/${totalAssets})`
    : `Progresso: ${processedAssets} fotos analisadas`;

  await notifee.displayNotification({
    id: INDEXING_NOTIFICATION_ID,
    title: 'Criando catálogo local',
    body,
    android: {
      channelId: INDEXING_CHANNEL_ID,
      smallIcon: 'ic_notification',
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
      ongoing: true,
      onlyAlertOnce: true,
      progress: {
        max: 100,
        current: percent,
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

/** Reexibe a notificação com o último progresso conhecido (wake, headless, retomada). */
export async function reviveIndexingNotification(reason: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  isNotificationDismissedByUser = false;
  lastNotificationUpdateAt = 0;
  console.warn(`[ForegroundService] reexibindo notificação (${reason})`);
  try {
    await updateIndexingProgress(lastProcessedAssets, lastTotalAssets);
  } catch (error) {
    console.warn('[ForegroundService] falha ao reexibir notificação', error);
  }
}

export async function stopIndexingForeground(): Promise<void> {
  if (Platform.OS !== 'android') return;
  isNotificationDismissedByUser = false;
  lastNotificationUpdateAt = 0;
  lastProcessedAssets = 0;
  lastTotalAssets = null;
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
