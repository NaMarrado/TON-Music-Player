import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { initDatabase } from '../database';
import { runMobileCloudBackgroundSync } from './auto-sync';
import { TON_CLOUD_AUTO_SYNC_TASK } from './background-registration';

// Task definitions must execute in global scope so iOS and Android can invoke
// them in a headless JS runtime before React mounts the application.
if (!TaskManager.isTaskDefined(TON_CLOUD_AUTO_SYNC_TASK)) {
  TaskManager.defineTask(TON_CLOUD_AUTO_SYNC_TASK, async () => {
    try {
      await initDatabase();
      await runMobileCloudBackgroundSync();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      if (error instanceof Error && (
        error.name === 'AbortError'
        || error.message === 'cloud_sync_cancelled'
      )) {
        return BackgroundTask.BackgroundTaskResult.Success;
      }
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}
