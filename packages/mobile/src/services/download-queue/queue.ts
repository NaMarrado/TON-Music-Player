import type { DownloadInput } from '../downloader';
import {
  maybeStartDownloadBackgroundWork,
} from '../download-runtime';
import {
  deleteQueueItemRecords,
  markQueueItemRecordsCancelled,
  requeueQueueItem,
  updateQueueItemRetry,
} from './db';
import {
  isQueueItemActive,
} from './items';
import type { QueueItem, QueueListener, QueueStatus } from './types';
import {
  createQueueRuntimeState,
  releaseQueueItemActive,
  type QueueRuntimeState,
} from './runtime';
import { clearQueueStatuses, replaceQueueItem, updateQueueItem } from './mutations';
import { notifyQueueListeners } from './progress';
import { processNextInQueue, resolveIdleWaiters } from './runner';
import { enqueueQueueItem, enqueueQueueItems } from './queue-enqueue';
import { resumeQueueOnStartup } from './queue-startup';

export class MobileDownloadQueue {
  readonly runtime: QueueRuntimeState = createQueueRuntimeState();

  subscribe(fn: QueueListener): () => void {
    this.runtime.listeners.add(fn);
    fn(this.runtime.items);
    return () => this.runtime.listeners.delete(fn);
  }

  getItems(): QueueItem[] {
    return [...this.runtime.items];
  }

  findDuplicate(input: DownloadInput): QueueItem | null {
    return this.runtime.items.find((item) => {
      if (!isQueueItemActive(item)) {
        return false;
      }

      return item.input.source === input.source
        && item.input.sourceId === input.sourceId;
    }) ?? null;
  }

  async enqueue(input: DownloadInput): Promise<number> {
    return enqueueQueueItem(this, input);
  }

  async enqueueBatch(
    inputs: DownloadInput[],
    options: {
      notifyEvery?: number;
      onInserted?: (
        inserted: Array<{ id: number; input: DownloadInput }>,
      ) => void | Promise<void>;
      onProgress?: (current: number, total: number) => void;
    } = {},
  ): Promise<number[]> {
    return enqueueQueueItems(this, inputs, options);
  }

  async cancel(id: number): Promise<void> {
    const item = this.runtime.items.find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    const active = isQueueItemActive(item);
    const shouldKeepCancellation = (
      this.runtime.activeItemIds.has(id)
      || this.runtime.activeDownloads.has(id)
      || item.status === 'downloading'
      || item.status === 'retrying'
    );
    const persistCancellation = markQueueItemRecordsCancelled([id])
      .then(() => deleteQueueItemRecords([id]));
    this.runtime.cancellingIds.add(id);
    this.runtime.items = this.runtime.items.filter((entry) => entry.id !== id);
    if (
      !releaseQueueItemActive(this.runtime, id)
      && active
      && this.runtime.activeCount > 0
    ) {
      this.runtime.activeCount -= 1;
    }
    const activeCancel = this.runtime.activeDownloads.get(id)?.cancel().catch(() => {});
    this.runtime.activeDownloads.delete(id);
    this.runtime.publishedProgress.delete(id);
    this.runtime.persistedProgress.delete(id);
    if (!shouldKeepCancellation) {
      this.runtime.cancellingIds.delete(id);
    }
    this.notify();
    void maybeStartDownloadBackgroundWork('cancel', id);
    this.processNext();
    await Promise.all([
      persistCancellation,
      activeCancel ?? Promise.resolve(),
    ]);
  }

  async cancelAllActive(): Promise<void> {
    const targets = this.runtime.items.filter(isQueueItemActive);
    if (targets.length === 0) {
      return;
    }

    if (this.runtime.scheduleTimer) {
      clearTimeout(this.runtime.scheduleTimer);
      this.runtime.scheduleTimer = null;
    }

    const ids = targets.map((item) => item.id);
    const activeRuntimeIds = new Set(targets
      .filter((item) => (
        this.runtime.activeItemIds.has(item.id)
        || this.runtime.activeDownloads.has(item.id)
        || item.status === 'downloading'
        || item.status === 'retrying'
      ))
      .map((item) => item.id));

    for (const id of ids) {
      this.runtime.cancellingIds.add(id);
    }
    this.runtime.items = this.runtime.items.filter((item) => !this.runtime.cancellingIds.has(item.id));

    const activeCancels: Promise<void>[] = [];
    for (const id of ids) {
      releaseQueueItemActive(this.runtime, id);
      const activeDownload = this.runtime.activeDownloads.get(id);
      if (activeDownload) {
        activeCancels.push(activeDownload.cancel().catch(() => {}));
      }
      this.runtime.activeDownloads.delete(id);
      this.runtime.publishedProgress.delete(id);
      this.runtime.persistedProgress.delete(id);
      void maybeStartDownloadBackgroundWork('cancel', id);
    }
    this.runtime.activeCount = this.runtime.activeItemIds.size;
    this.notify();

    await Promise.all([
      markQueueItemRecordsCancelled(ids).then(() => deleteQueueItemRecords(ids)),
      ...activeCancels,
    ]);

    for (const id of ids) {
      if (!activeRuntimeIds.has(id)) {
        this.runtime.cancellingIds.delete(id);
      }
    }
    this.processNext();
  }

  async retry(id: number): Promise<void> {
    const item = this.runtime.items.find((entry) => entry.id === id);
    if (!item || item.status !== 'error') {
      return;
    }

    this.replaceItem(id, {
      ...item,
      status: 'pending',
      progress: 0,
      error: null,
      retryCount: 0,
    });
    await Promise.all([
      requeueQueueItem(id),
      updateQueueItemRetry(id, 0),
    ]);
    this.runtime.cancellingIds.delete(id);
    this.runtime.publishedProgress.delete(id);
    this.runtime.persistedProgress.delete(id);
    this.notify();
    this.processNext();
    void maybeStartDownloadBackgroundWork('retry', id);
  }

  goOnline(): void {
    if (this.runtime.online) return;
    this.runtime.online = true;
    this.processNext();
  }

  goOffline(): void {
    this.runtime.online = false;
  }

  hasActive(): boolean {
    return this.runtime.activeCount > 0 || this.runtime.items.some(isQueueItemActive);
  }

  clearCompleted(): void {
    this.clearStatuses(['completed']);
  }

  clearFailed(): void {
    this.clearStatuses(['error']);
  }

  clearAll(): void {
    this.clearStatuses(['completed', 'error']);
  }

  async resumeOnStartup(): Promise<void> {
    await resumeQueueOnStartup(this);
  }

  waitUntilIdle(): Promise<void> {
    if (!this.hasActive()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.runtime.idleResolvers.add(resolve);
    });
  }

  notify = (): void => {
    notifyQueueListeners(this.runtime, () => this.resolveIdleWaiters());
  };

  replaceItem(id: number, nextItem: QueueItem): QueueItem | null {
    return replaceQueueItem(this.runtime, id, nextItem);
  }

  updateItem(
    id: number,
    updater: (current: QueueItem) => QueueItem,
  ): QueueItem | null {
    return updateQueueItem(this.runtime, id, updater);
  }

  private clearStatuses(statuses: QueueStatus[]): void {
    clearQueueStatuses(this.runtime, statuses, () => this.notify());
  }

  processNext = (): void => {
    processNextInQueue(this);
  };

  resolveIdleWaiters = (): void => {
    resolveIdleWaiters(this);
  };
}
