import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getBackgroundIndexConsent } from './consent';
import {
  hasGalleryPhotoPermission,
  logGalleryPermissionState,
} from './galleryPermission';

export const BACKGROUND_INDEX_TASK_NAME = 'busca-facial-local.index-gallery';

TaskManager.defineTask(BACKGROUND_INDEX_TASK_NAME, async ({ error }) => {
  if (error) {
    console.error('[BackgroundIndex] Native task error', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }

  try {
    await logGalleryPermissionState('task-entry');
    if (
      (await getBackgroundIndexConsent()) !== 'accepted' ||
      !(await hasGalleryPhotoPermission())
    ) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const { runBackgroundIndexBatch } = await import('./batchRunner');
    await runBackgroundIndexBatch();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (cause) {
    console.error('[BackgroundIndex] Task preparation failed', cause);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});