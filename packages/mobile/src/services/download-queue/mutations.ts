import { deleteQueueItemRecords } from './db';
import type { QueueRuntimeState } from './runtime';
import type { QueueItem, QueueStatus } from './types';

export function replaceQueueItem(
  state: QueueRuntimeState,
  id: number,
  nextItem: QueueItem,
): QueueItem | null {
  const index = state.items.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return null;
  }
  state.items[index] = nextItem;
  return nextItem;
}

export function updateQueueItem(
  state: QueueRuntimeState,
  id: number,
  updater: (current: QueueItem) => QueueItem,
): QueueItem | null {
  const current = state.items.find((entry) => entry.id === id);
  if (!current) {
    return null;
  }

  return replaceQueueItem(state, id, updater(current));
}

export function clearQueueStatuses(
  state: QueueRuntimeState,
  statuses: QueueStatus[],
  notify: () => void,
): void {
  const removable = new Set(statuses);
  const ids = state.items
    .filter((item) => removable.has(item.status))
    .map((item) => item.id);

  state.items = state.items.filter((item) => !removable.has(item.status));
  for (const id of ids) {
    state.publishedProgress.delete(id);
    state.persistedProgress.delete(id);
  }
  notify();
  void deleteQueueItemRecords(ids);
}
