import { Platform } from 'react-native';
import { getBackgroundIndexConsent } from './consent';
import { hasGalleryPhotoPermission } from './galleryPermission';
import { registrationAction } from './registrationPolicy';

// Kept stable across launches; WorkManager/BGTaskScheduler may delay execution.
const MINIMUM_INTERVAL_MINUTES = 60;
let previousSync: Promise<void> = Promise.resolve();

async function reconcileRegistration(): Promise<void> {
  if (Platform.OS === 'web') return;

  // Imported only on native: web and older dev clients must still render the app.
  const [BackgroundTask, TaskManager] = await Promise.all([
    import('expo-background-task'),
    import('expo-task-manager'),
  ]);
  const { BACKGROUND_INDEX_TASK_NAME } = await import('./backgroundIndexTask');

  const consent = await getBackgroundIndexConsent();
  const hasPermission =
    consent === 'accepted' && (await hasGalleryPhotoPermission());
  const available = await TaskManager.isAvailableAsync();
  if (!available) {
    if (hasPermission) {
      throw new Error('Tarefas em segundo plano não estão disponíveis neste aplicativo.');
    }
    return;
  }
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_INDEX_TASK_NAME);
  const action = registrationAction(consent, hasPermission, isRegistered);

  if (action === 'unregister') {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_INDEX_TASK_NAME);
    return;
  }
  if (action === 'none') return;
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) {
    throw new Error('Tarefas em segundo plano não estão disponíveis neste aplicativo.');
  }

  await BackgroundTask.registerTaskAsync(BACKGROUND_INDEX_TASK_NAME, {
    minimumInterval: MINIMUM_INTERVAL_MINUTES,
  });
}

/** Serialize preference changes and startup checks to prevent a late registration after decline. */
export function syncBackgroundIndexRegistration(): Promise<void> {
  const sync = previousSync.catch(() => undefined).then(reconcileRegistration);
  previousSync = sync;
  return sync;
}