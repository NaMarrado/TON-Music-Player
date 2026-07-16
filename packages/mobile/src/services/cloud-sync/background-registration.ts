import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const TON_CLOUD_AUTO_SYNC_TASK = 'TONCloudAutoSyncTask';

let registrationMutation = Promise.resolve();

function serializeRegistrationMutation(mutation: () => Promise<void>): Promise<void> {
  const result = registrationMutation.catch(() => {}).then(mutation);
  registrationMutation = result.catch(() => {});
  return result;
}

export function registerMobileCloudBackgroundTask(): Promise<void> {
  return serializeRegistrationMutation(async () => {
    if (await TaskManager.isTaskRegisteredAsync(TON_CLOUD_AUTO_SYNC_TASK)) {
      return;
    }
    await BackgroundTask.registerTaskAsync(TON_CLOUD_AUTO_SYNC_TASK, {
      // Android WorkManager enforces a minimum of 15 minutes. iOS treats this as
      // a hint and decides the actual launch time based on usage and system state.
      minimumInterval: 15,
    });
  });
}

export function unregisterMobileCloudBackgroundTask(): Promise<void> {
  // Expo's iOS task service throws an uncaught Objective-C exception when its
  // native registration drifts from TaskManager's JS view. Keep the task
  // dormant instead; its handler checks the persisted enabled flag before I/O.
  if (Platform.OS === 'ios') return Promise.resolve();

  return serializeRegistrationMutation(async () => {
    if (!(await TaskManager.isTaskRegisteredAsync(TON_CLOUD_AUTO_SYNC_TASK))) {
      return;
    }
    await BackgroundTask.unregisterTaskAsync(TON_CLOUD_AUTO_SYNC_TASK);
  });
}
