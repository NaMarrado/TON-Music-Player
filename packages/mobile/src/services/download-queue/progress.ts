import { countPerfEvent } from '../perf';
import { syncDownloadQueueRuntimeSnapshot } from '../download-runtime';
import { updateQueueItemProgress } from './db';
import type { QueueRuntimeState } from './runtime';
import type { QueueItem } from './types';

export function createQueueSnapshot(items: QueueItem[]): QueueItem[] {
  return items.map((item) => ({
    ...item,
    input: { ...item.input },
  }));
}

export function notifyQueueListeners(
  state: QueueRuntimeState,
  onIdleCheck: () => void,
): void {
  const snapshot = createQueueSnapshot(state.items);

  for (const fn of state.listeners) {
    fn(snapshot);
  }

  void syncDownloadQueueRuntimeSnapshot(snapshot, state.previousSnapshot);
  state.previousSnapshot = new Map(snapshot.map((item) => [item.id, item]));
  onIdleCheck();
}

export function scheduleProgressNotify(
  state: QueueRuntimeState,
  notify: () => void,
): void {
  if (state.progressNotifyTimer) {
    return;
  }

  state.progressNotifyTimer = setTimeout(() => {
    state.progressNotifyTimer = null;
    countPerfEvent('downloads:progress-notify');
    notify();
  }, 250);
}

export function clearProgressTracking(state: QueueRuntimeState, itemId: number): void {
  state.publishedProgress.delete(itemId);
  state.persistedProgress.delete(itemId);
}

export function trackQueueProgress(
  state: QueueRuntimeState,
  itemId: number,
  progress: number,
  notify: () => void,
): void {
  const lastPublished = state.publishedProgress.get(itemId) ?? -1;
  if (progress >= 1 || progress - lastPublished >= 0.02 || progress < lastPublished) {
    state.publishedProgress.set(itemId, progress);
    scheduleProgressNotify(state, notify);
  }

  const lastPersisted = state.persistedProgress.get(itemId) ?? -1;
  if (progress >= 1 || progress - lastPersisted >= 0.05 || progress < lastPersisted) {
    state.persistedProgress.set(itemId, progress);
    void updateQueueItemProgress(itemId, progress);
  }
}
