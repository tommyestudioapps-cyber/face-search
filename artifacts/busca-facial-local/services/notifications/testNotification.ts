import notifee, { AndroidImportance } from '@notifee/react-native';
import { Platform } from 'react-native';

export const TEST_CHANNEL_ID = 'search-face-test';

export async function ensureTestChannel(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  return notifee.createChannel({
    id: TEST_CHANNEL_ID,
    name: 'Teste (Search Face)',
    importance: AndroidImportance.LOW,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= 1;
}

export async function showTestNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await ensureTestChannel();
  await requestNotificationPermission();
  await notifee.displayNotification({
    title: 'Notificação de teste',
    body: 'Search Face está funcionando em segundo plano.',
    android: {
      channelId: TEST_CHANNEL_ID,
      smallIcon: 'ic_notification',
      pressAction: { id: 'default' },
    },
  });
}
