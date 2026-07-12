import { AppState } from 'react-native';
import { initDatabase } from '../database';
import { requeueQueueItem } from '../download-queue/db';
import { maybeStartBackgroundWork, stopBackgroundWorkIfIdle } from './background-work';
import { ensureDownloadNotificationPermission } from './permissions';
import { syncAndroidDownloadQueueSnapshot } from './queue-sync';
import {
  ensureChannelsReady,
  getAppState,
  getQueue,
  hasRuntimeInitialized,
  isAndroid,
  markRuntimeInitialized,
  setAppState,
  type HeadlessTaskPayload,
} from './shared';

export function initializeAndroidDownloadRuntime(): void {
  if (!isAndroid() || hasRuntimeInitialized()) {
    return;
  }

  markRuntimeInitialized();
  void ensureChannelsReady();

  AppState.addEventListener('change', (nextState) => {
    const previous = getAppState();
    setAppState(nextState);

    if (previous === 'active' && nextState !== 'active') {
      const queue = getQueue();
      if (queue.hasActive()) {
        void maybeStartBackgroundWork('resume');
      }
    }
  });
}

export async function runDownloadHeadlessTask(
  payload: HeadlessTaskPayload = {},
): Promise<void> {
  await initDatabase();
  initializeAndroidDownloadRuntime();
  await ensureDownloadNotificationPermission(false);

  const action = payload.action ?? 'resume';
  const parsedItemId = Number(payload.itemId);
  const itemId = Number.isFinite(parsedItemId) ? parsedItemId : null;

  if (action === 'retry' && itemId != null) {
    await requeueQueueItem(itemId);
  }

  const queue = getQueue();
  await queue.resumeOnStartup();

  if (action === 'cancel' && itemId != null) {
    await queue.cancel(itemId);
  }

  await queue.waitUntilIdle();
  await stopBackgroundWorkIfIdle();
}

export {
  ensureDownloadNotificationPermission,
  maybeStartBackgroundWork,
  stopBackgroundWorkIfIdle,
  syncAndroidDownloadQueueSnapshot,
};
