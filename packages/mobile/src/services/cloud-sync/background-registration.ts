import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const TON_CLOUD_AUTO_SYNC_TASK = 'TONCloudAutoSyncTask';

export async function registerMobileCloudBackgroundTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TON_CLOUD_AUTO_SYNC_TASK)) {
    return;
  }
  await BackgroundTask.registerTaskAsync(TON_CLOUD_AUTO_SYNC_TASK, {
    // Android WorkManager enforces a minimum of 15 minutes. iOS treats this as
    // a hint and decides the actual launch time based on usage and system state.
    minimumInterval: 15,
  });
}

export async function unregisterMobileCloudBackgroundTask(): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(TON_CLOUD_AUTO_SYNC_TASK))) {
    return;
  }
  await BackgroundTask.unregisterTaskAsync(TON_CLOUD_AUTO_SYNC_TASK);
}
