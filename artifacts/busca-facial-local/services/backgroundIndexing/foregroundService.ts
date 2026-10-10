import notifee, {
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import { Platform } from 'react-native';

export const INDEXING_CHANNEL_ID = 'search-face-indexing';
export const INDEXING_NOTIFICATION_ID = 'search-face-indexing-foreground';
export const INDEXING_PAUSE_ACTION = 'search-face-pause-indexing';

let pauseHandler: (() => void) | null = null;

notifee.registerForegroundService(() => {
  // PROBE TEMPORÁRIO — remover após A9-preview.
  console.warn('[HeadlessProbe] callback registerForegroundService chamado');
  let tickCount = 0;
  const startedAt = Date.now();
  const probe = setInterval(() => {
    tickCount += 1;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.warn(
      `[HeadlessProbe] tick=${tickCount} elapsed=${elapsed}s`,
    );
  }, 5000);
  // Fim do probe.

  return new Promise<void>(() => {
    // Promise intencionalmente pendente para manter o serviço vivo
    // enquanto o loop JS estiver rodando. O serviço é interrompido
    // via notifee.stopForegroundService() em stopIndexingForeground().
    // O interval acima NÃO é limpo aqui de propósito — é um probe
    // temporário e será removido após a coleta de dados.
    void probe;
  });
});

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
  await notifee.displayNotification({
    id: INDEXING_NOTIFICATION_ID,
    title: 'Preparando índice local',
    body: 'Search Face está analisando suas fotos em segundo plano.',
    android: {
      channelId: INDEXING_CHANNEL_ID,
      smallIcon: 'ic_notification',
      asForegroundService: true,
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
}

export async function updateIndexingProgress(
  processedAssets: number,
  totalAssets: number | null,
): Promise<void> {
  if (Platform.OS !== 'android') return;
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
