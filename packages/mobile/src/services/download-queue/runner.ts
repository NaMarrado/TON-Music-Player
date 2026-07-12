import { MAX_CONCURRENT_DOWNLOADS } from '@ton/core';
import { downloadTrack } from '../downloader';
import { stopDownloadBackgroundWorkIfIdle } from '../download-runtime';
import { updateQueueItemFormat, updateQueueItemProgress, updateQueueItemStatus } from './db';
import { startIosBackgroundQueueItem } from './ios-background';
import { getScheduleDelay } from './timing';
import {
  markQueueItemActive,
  releaseQueueItemActive,
  type QueueRuntimeState,
} from './runtime';
import { clearProgressTracking, trackQueueProgress } from './progress';
import { replaceQueueItem, updateQueueItem } from './mutations';
import { completeQueueItem, failQueueItem, isCancelledQueueItem } from './settlement';

export interface QueueRunnerFacade {
  runtime: QueueRuntimeState;
  notify: () => void;
  processNext: () => void;
  hasActive: () => boolean;
}

export function resolveIdleWaiters(queue: QueueRunnerFacade): void {
  if (queue.hasActive()) {
    return;
  }

  for (const resolve of queue.runtime.idleResolvers) {
    resolve();
  }
  queue.runtime.idleResolvers.clear();
  void stopDownloadBackgroundWorkIfIdle();
}

export function processNextInQueue(queue: QueueRunnerFacade): void {
  const { runtime } = queue;
  if (!runtime.online || runtime.activeCount >= MAX_CONCURRENT_DOWNLOADS) {
    return;
  }

  const next = runtime.items.find((item) => item.status === 'pending');
  if (!next) {
    return;
  }

  const delayMs = getScheduleDelay(runtime.activeCount, runtime.consecutiveErrors);
  if (delayMs > 0) {
    if (runtime.scheduleTimer) {
      return;
    }
    console.log(
      `[DL-QUEUE] Delaying next download by ${Math.round(delayMs / 1000)}s (errors: ${runtime.consecutiveErrors})`,
    );
    runtime.scheduleTimer = setTimeout(() => {
      runtime.scheduleTimer = null;
      startQueueItem(queue, next.id);
    }, delayMs);
    return;
  }

  startQueueItem(queue, next.id);
}

export function startQueueItem(queue: QueueRunnerFacade, itemId: number): void {
  const { runtime } = queue;
  const latest = runtime.items.find((entry) => entry.id === itemId);
  if (
    !latest ||
    !runtime.online ||
    runtime.activeCount >= MAX_CONCURRENT_DOWNLOADS ||
    latest.status !== 'pending'
  ) {
    return;
  }

  markQueueItemActive(runtime, itemId);
  replaceQueueItem(runtime, itemId, {
    ...latest,
    status: 'downloading',
    progress: 0,
    error: null,
  });
  runtime.publishedProgress.delete(itemId);
  runtime.persistedProgress.set(itemId, 0);
  void updateQueueItemStatus(itemId, 'downloading');
  void updateQueueItemProgress(itemId, 0);
  queue.notify();

  if (startIosBackgroundQueueItem(queue, itemId)) {
    return;
  }

  void processQueueItem(queue, itemId).finally(() => {
    releaseQueueItemActive(runtime, itemId);
    queue.processNext();
    resolveIdleWaiters(queue);
  });
}

export async function processQueueItem(
  queue: QueueRunnerFacade,
  itemId: number,
): Promise<void> {
  const { runtime } = queue;
  const item = runtime.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  try {
    console.log(
      '[DL-QUEUE] Starting download:',
      item.input.title,
      'source:',
      `${item.input.source}:${item.input.sourceId}`,
    );

    const result = await downloadTrack(item.input, {
      isCancelled: () => runtime.cancellingIds.has(itemId),
      onCancelable: (cancel) => {
        if (runtime.cancellingIds.has(itemId)) {
          void cancel().catch(() => {});
          return;
        }
        runtime.activeDownloads.set(itemId, { cancel });
      },
      onResolved: async (source) => {
        updateQueueItem(runtime, itemId, (current) => ({
          ...current,
          format: source.format,
        }));
        await updateQueueItemFormat(itemId, source.format);
        queue.notify();
      },
      onProgress: (progress) => {
        const updated = updateQueueItem(runtime, itemId, (current) => (
          current.progress === progress ? current : { ...current, progress }
        ));
        if (!updated) {
          return;
        }

        if (progress % 0.1 < 0.02) {
          console.log(
            '[DL-QUEUE] Progress:',
            item.input.title,
            `${Math.round(progress * 100)}%`,
          );
        }

        trackQueueProgress(runtime, itemId, progress, queue.notify);
      },
    });

    await completeQueueItem(queue, itemId, result.trackId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isCancelledQueueItem(queue, itemId, message)) {
      clearProgressTracking(runtime, itemId);
      return;
    }

    await failQueueItem(queue, itemId, message);
  } finally {
    runtime.activeDownloads.delete(itemId);
    runtime.cancellingIds.delete(itemId);
    queue.notify();
  }
}
