import { Platform } from 'react-native';
import {
  backfillCompletedQueueItemFormats,
  deleteCancelledQueueItemRecords,
  getStoredQueueRows,
  requeueQueueItem,
} from './db';
import { hydrateQueueItem } from './items';
import { restoreIosBackgroundQueueItems } from './ios-background';
import type { MobileDownloadQueue } from './queue';

export async function resumeQueueOnStartup(queue: MobileDownloadQueue): Promise<void> {
  if (queue.runtime.resumePromise) return queue.runtime.resumePromise;
  queue.runtime.resumePromise = (async () => {
    await deleteCancelledQueueItemRecords();
    await backfillCompletedQueueItemFormats();
    const rows = await getStoredQueueRows();
    const knownIds = new Set(queue.runtime.items.map((item) => item.id));
    const interruptedAndroidItemIds: number[] = [];
    for (const row of rows) {
      if (knownIds.has(row.id)) continue;
      const hydratedItem = hydrateQueueItem(row);
      const wasInterruptedOnAndroid = Platform.OS === 'android'
        && (hydratedItem.status === 'downloading' || hydratedItem.status === 'retrying');
      if (wasInterruptedOnAndroid) {
        interruptedAndroidItemIds.push(row.id);
        queue.runtime.items.push({
          ...hydratedItem, status: 'pending', progress: 0, error: null,
        });
        queue.runtime.persistedProgress.set(row.id, 0);
      } else {
        queue.runtime.items.push(hydratedItem);
        queue.runtime.persistedProgress.set(row.id, row.progress ?? 0);
      }
    }
    await Promise.all(interruptedAndroidItemIds.map(requeueQueueItem));
    await restoreIosBackgroundQueueItems(queue);
    queue.notify();
    queue.processNext();
  })().finally(() => { queue.runtime.resumePromise = null; });
  await queue.runtime.resumePromise;
}
