import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getBackgroundIndexConsent } from './consent';
import { hasGalleryPhotoPermission } from './galleryPermission';

export const BACKGROUND_INDEX_TASK_NAME = 'busca-facial-local.index-gallery';

TaskManager.defineTask(BACKGROUND_INDEX_TASK_NAME, async ({ error }) => {
  if (error) {
    console.error('[BackgroundIndex] Native task error', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }

  try {
    if (
      (await getBackgroundIndexConsent()) !== 'accepted' ||
      !(await hasGalleryPhotoPermission())
    ) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // The bounded, resumable gallery batch is connected in step 5.
    // Do not run indexGallery here: it currently processes the entire gallery.
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (cause) {
    console.error('[BackgroundIndex] Task preparation failed', cause);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});