import type { QueueItem, QueueListener } from './types';

export type ActiveDownloadHandle = {
  cancel: () => Promise<void>;
};

export interface QueueRuntimeState {
  items: QueueItem[];
  activeCount: number;
  listeners: Set<QueueListener>;
  online: boolean;
  progressNotifyTimer: ReturnType<typeof setTimeout> | null;
  publishedProgress: Map<number, number>;
  persistedProgress: Map<number, number>;
  activeDownloads: Map<number, ActiveDownloadHandle>;
  activeItemIds: Set<number>;
  cancellingIds: Set<number>;
  previousSnapshot: Map<number, QueueItem>;
  idleResolvers: Set<() => void>;
  resumePromise: Promise<void> | null;
}

export function createQueueRuntimeState(): QueueRuntimeState {
  return {
    items: [],
    activeCount: 0,
    listeners: new Set<QueueListener>(),
    online: true,
    progressNotifyTimer: null,
    publishedProgress: new Map<number, number>(),
    persistedProgress: new Map<number, number>(),
    activeDownloads: new Map<number, ActiveDownloadHandle>(),
    activeItemIds: new Set<number>(),
    cancellingIds: new Set<number>(),
    previousSnapshot: new Map<number, QueueItem>(),
    idleResolvers: new Set<() => void>(),
    resumePromise: null,
  };
}

export function markQueueItemActive(runtime: QueueRuntimeState, itemId: number): void {
  if (runtime.activeItemIds.has(itemId)) {
    return;
  }

  runtime.activeItemIds.add(itemId);
  runtime.activeCount += 1;
}

export function releaseQueueItemActive(runtime: QueueRuntimeState, itemId: number): boolean {
  const wasActive = runtime.activeItemIds.delete(itemId);
  if (wasActive && runtime.activeCount > 0) {
    runtime.activeCount -= 1;
  }

  return wasActive;
}
