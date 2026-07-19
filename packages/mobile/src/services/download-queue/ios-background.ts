import { prepareDownloadSource } from '../downloader';
import { cleanupFailedDownload } from '../downloader/filesystem';
import {
  acknowledgeIosBackgroundSettled,
  getIosBackgroundDownloadSnapshot,
  initializeIosBackgroundDownloadsNative,
  isIosCloudSyncBackgroundItem,
} from '../download-runtime/ios-background-session';
import {
  attachActiveHandle,
  beginQueueItemDownloadActivity,
  clearFailedStrategies,
  endQueueItemDownloadActivity,
  isIosBackgroundQueueEnabled,
  releaseActiveSlot,
} from './ios-background-activity';
import {
  createFailedCandidateSnapshotItem,
  recoverPreparedIosQueueItem,
  tryStartNextIosBackgroundCandidate,
} from './ios-background-candidates';
import {
  ensureIosBackgroundQueueEvents,
  ensureIosBackgroundQueueEventSubscription,
  ensureIosBackgroundQueueReconcile,
  restoreRunningItem,
  settleRestoredSnapshotItem,
} from './ios-background-events';
import { iosBackgroundState as state, type IosBackgroundQueueFacade } from './ios-background-state';
import { clearProgressTracking } from './progress';
import { failQueueItem } from './settlement';

export type { IosBackgroundQueueFacade } from './ios-background-state';

export async function restoreIosBackgroundQueueItems(
  queue: IosBackgroundQueueFacade,
): Promise<void> {
  if (!isIosBackgroundQueueEnabled()) return;
  ensureIosBackgroundQueueEvents(queue);
  if (state.restorePromise) return state.restorePromise;
  state.restorePromise = (async () => {
    await initializeIosBackgroundDownloadsNative();
    const snapshot = await getIosBackgroundDownloadSnapshot();
    const items = (Array.isArray(snapshot?.items) ? snapshot.items : [])
      .filter((item) => !isIosCloudSyncBackgroundItem(item));
    for (const item of items) {
      if (item.state === 'running') await restoreRunningItem(queue, item);
    }
    queue.notify();
    for (const item of items) {
      if (item.state !== 'running') await settleRestoredSnapshotItem(queue, item);
    }
    queue.notify();
  })().finally(() => { state.restorePromise = null; });
  await state.restorePromise;
}

export function startIosBackgroundQueueItem(
  queue: IosBackgroundQueueFacade,
  itemId: number,
): boolean {
  if (!isIosBackgroundQueueEnabled()) return false;
  ensureIosBackgroundQueueEventSubscription(queue);
  attachActiveHandle(queue, itemId);
  void (async () => {
    const item = queue.runtime.items.find((entry) => entry.id === itemId);
    if (!item) return;
    let prepared: Awaited<ReturnType<typeof prepareDownloadSource>> | null = null;
    try {
      await initializeIosBackgroundDownloadsNative();
      if (queue.runtime.cancellingIds.has(itemId)) return;
      await beginQueueItemDownloadActivity(itemId, item);
      if (queue.runtime.cancellingIds.has(itemId)) {
        await endQueueItemDownloadActivity(itemId);
        return;
      }
      clearFailedStrategies(itemId);
      prepared = await prepareDownloadSource(item.input);
      if (queue.runtime.cancellingIds.has(itemId)) {
        await cleanupFailedDownload(prepared.filePath);
        await endQueueItemDownloadActivity(itemId);
        return;
      }
      attachActiveHandle(queue, itemId);
      await recoverPreparedIosQueueItem(queue, itemId, item, prepared);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!queue.runtime.cancellingIds.has(itemId) && message !== 'download_cancelled') {
        const failedCandidate = createFailedCandidateSnapshotItem(itemId, item, message, prepared);
        const restarted = await tryStartNextIosBackgroundCandidate(queue, failedCandidate);
        if (restarted) {
          ensureIosBackgroundQueueReconcile(queue);
          return;
        }
        await endQueueItemDownloadActivity(itemId);
        await failQueueItem(queue, itemId, failedCandidate.error ?? message);
      } else {
        if (prepared) await cleanupFailedDownload(prepared.filePath);
        await endQueueItemDownloadActivity(itemId);
        clearProgressTracking(queue.runtime, itemId);
      }
      await acknowledgeIosBackgroundSettled(itemId);
    } finally {
      queue.runtime.cancellingIds.delete(itemId);
      releaseActiveSlot(queue, itemId);
      queue.notify();
      queue.processNext();
    }
  })();
  return true;
}
