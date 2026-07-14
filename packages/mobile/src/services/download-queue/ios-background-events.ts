import { cleanupFailedDownload } from '../downloader/filesystem';
import {
  acknowledgeIosBackgroundSettled,
  getIosBackgroundDownloadSnapshot,
  subscribeToIosBackgroundDownloads,
  type IosBackgroundDownloadEvent,
  type IosBackgroundDownloadSnapshotItem,
} from '../download-runtime/ios-background-session';
import { updateQueueItemProgress, updateQueueItemStatus } from './db';
import {
  attachActiveHandle,
  clearFailedStrategies,
  endQueueItemDownloadActivity,
  hasActiveSlot,
  isIosBackgroundQueueEnabled,
  releaseActiveSlot,
} from './ios-background-activity';
import { tryStartNextIosBackgroundCandidate } from './ios-background-candidates';
import { failBackgroundItem, finalizeCompletedBackgroundItem } from './ios-background-finalize';
import { iosBackgroundState as state, type IosBackgroundQueueFacade } from './ios-background-state';
import { updateQueueItem } from './mutations';
import { clearProgressTracking, trackQueueProgress } from './progress';
import { markQueueItemActive } from './runtime';

function restoreErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'ios_background_restore_failed';
}

export async function settleRestoredSnapshotItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  if (item.state === 'completed') {
    try { await finalizeCompletedBackgroundItem(queue, item); }
    catch (error) {
      console.warn('[DL-IOS] failed to finalize restored completed item', item.itemId, error);
      await failBackgroundItem(queue, { ...item, state: 'failed', error: restoreErrorMessage(error) });
    }
    return;
  }
  if (item.state === 'failed') {
    const restarted = await tryStartNextIosBackgroundCandidate(queue, item);
    if (restarted) {
      ensureIosBackgroundQueueReconcile(queue);
    } else {
      clearFailedStrategies(item.itemId);
      await failBackgroundItem(queue, item);
    }
    return;
  }
  if (item.state === 'cancelled') {
    await endQueueItemDownloadActivity(item.itemId);
    await cleanupFailedDownload(item.destinationPath);
    await acknowledgeIosBackgroundSettled(item.itemId);
  }
}

async function handleBackgroundEvent(
  queue: IosBackgroundQueueFacade,
  event: IosBackgroundDownloadEvent,
): Promise<void> {
  if (event.state === 'running') {
    const alreadyActive = queue.runtime.activeItemIds.has(event.itemId);
    const updated = updateQueueItem(queue.runtime, event.itemId, (current) => (
      current.progress === event.progress && current.status === 'downloading'
        ? current
        : { ...current, status: 'downloading', progress: event.progress, error: null }
    ));
    if (!updated) return;
    if (!alreadyActive) markQueueItemActive(queue.runtime, event.itemId);
    attachActiveHandle(queue, event.itemId);
    trackQueueProgress(queue.runtime, event.itemId, event.progress, queue.notify);
    return;
  }
  if (state.foregroundPromiseItemIds.has(event.itemId)) return;
  if (event.state === 'completed') {
    const wasActive = hasActiveSlot(queue, event.itemId);
    try {
      await finalizeCompletedBackgroundItem(queue, event);
      clearFailedStrategies(event.itemId);
    } catch (error) {
      await failBackgroundItem(queue, {
        ...event, state: 'failed', error: restoreErrorMessage(error),
      });
    } finally {
      if (wasActive) releaseActiveSlot(queue, event.itemId);
      else queue.runtime.activeDownloads.delete(event.itemId);
      queue.notify();
      queue.processNext();
    }
    return;
  }
  if (event.state === 'failed') {
    const wasActive = hasActiveSlot(queue, event.itemId);
    let restarted = false;
    try {
      restarted = await tryStartNextIosBackgroundCandidate(queue, event);
      if (restarted) {
        ensureIosBackgroundQueueReconcile(queue);
      } else {
        clearFailedStrategies(event.itemId);
        await failBackgroundItem(queue, event);
      }
    } finally {
      if (!restarted) {
        if (wasActive) releaseActiveSlot(queue, event.itemId);
        else queue.runtime.activeDownloads.delete(event.itemId);
      }
      queue.notify();
      if (!restarted) queue.processNext();
    }
    return;
  }
  const wasActive = hasActiveSlot(queue, event.itemId);
  clearFailedStrategies(event.itemId);
  clearProgressTracking(queue.runtime, event.itemId);
  queue.runtime.cancellingIds.delete(event.itemId);
  await cleanupFailedDownload(event.destinationPath);
  if (wasActive) releaseActiveSlot(queue, event.itemId);
  else queue.runtime.activeDownloads.delete(event.itemId);
  await acknowledgeIosBackgroundSettled(event.itemId);
  queue.notify();
  queue.processNext();
}

export function ensureIosBackgroundQueueEventSubscription(
  queue: IosBackgroundQueueFacade,
): void {
  if (!isIosBackgroundQueueEnabled() || state.eventsSubscription) return;
  state.eventsSubscription = subscribeToIosBackgroundDownloads((event) => {
    void handleBackgroundEvent(queue, event).catch((error) => {
      console.warn('[DL-IOS] background event failed', error);
    });
  });
}

export async function restoreRunningItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (!queueItem) return;
  if (!queue.runtime.activeItemIds.has(item.itemId)) {
    markQueueItemActive(queue.runtime, item.itemId);
  }
  attachActiveHandle(queue, item.itemId);
  updateQueueItem(queue.runtime, item.itemId, (current) => ({
    ...current, status: 'downloading', progress: item.progress, error: null,
  }));
  queue.runtime.persistedProgress.set(item.itemId, item.progress);
  await updateQueueItemStatus(item.itemId, 'downloading');
  await updateQueueItemProgress(item.itemId, item.progress);
}

function hasPendingWork(queue: IosBackgroundQueueFacade): boolean {
  return queue.runtime.activeDownloads.size > 0 || queue.runtime.items.some((item) => (
    item.status === 'pending' || item.status === 'downloading' || item.status === 'retrying'
  ));
}

async function settleSnapshotItemOnce(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  if (state.settlingItemIds.has(item.itemId)) return;
  state.settlingItemIds.add(item.itemId);
  try { await settleRestoredSnapshotItem(queue, item); }
  finally { state.settlingItemIds.delete(item.itemId); }
}

async function reconcileSnapshot(queue: IosBackgroundQueueFacade): Promise<void> {
  if (state.reconcileInFlight) return;
  state.reconcileInFlight = true;
  try {
    const snapshot = await getIosBackgroundDownloadSnapshot();
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    for (const item of items) {
      if (item.state === 'running') await restoreRunningItem(queue, item);
      else await settleSnapshotItemOnce(queue, item);
    }
    queue.notify();
    if (!hasPendingWork(queue) && items.length === 0 && state.reconcileTimer) {
      clearInterval(state.reconcileTimer);
      state.reconcileTimer = null;
    }
  } catch (error) {
    console.warn('[DL-IOS] background reconcile failed', error);
  } finally {
    state.reconcileInFlight = false;
  }
}

export function ensureIosBackgroundQueueReconcile(queue: IosBackgroundQueueFacade): void {
  if (!isIosBackgroundQueueEnabled()) return;
  if (!state.reconcileTimer) {
    state.reconcileTimer = setInterval(() => void reconcileSnapshot(queue), 2_000);
  }
  void reconcileSnapshot(queue);
}

export function ensureIosBackgroundQueueEvents(queue: IosBackgroundQueueFacade): void {
  ensureIosBackgroundQueueEventSubscription(queue);
  ensureIosBackgroundQueueReconcile(queue);
}
