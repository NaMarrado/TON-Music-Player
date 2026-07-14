import * as FileSystem from 'expo-file-system';
import {
  finalizeDownloadedTrack,
  prepareDownloadSource,
  type DownloadFinalizeInput,
} from '../downloader';
import { cleanupFailedDownload } from '../downloader/filesystem';
import {
  acknowledgeIosBackgroundSettled,
  recoverIosBackgroundDownload,
  type IosBackgroundDownloadSnapshotItem,
} from '../download-runtime/ios-background-session';
import {
  attachActiveHandle,
  beginQueueItemDownloadActivity,
  endQueueItemDownloadActivity,
  getActiveNotificationCopy,
} from './ios-background-activity';
import type { IosBackgroundQueueFacade } from './ios-background-state';
import { completeQueueItem, failQueueItem } from './settlement';

async function removeOrphanCompletedFile(filePath: string): Promise<void> {
  try { await FileSystem.deleteAsync(filePath, { idempotent: true }); }
  catch { /* best-effort */ }
}

async function recoverInvalidCompletedBackgroundItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<number> {
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (!queueItem) throw new Error('queue_item_missing');
  console.warn(
    '[DL-IOS] Recovering invalid completed background item via fresh native foreground session:',
    queueItem.input.title,
  );
  await beginQueueItemDownloadActivity(item.itemId, queueItem);
  const prepared = await prepareDownloadSource(queueItem.input);
  attachActiveHandle(queue, item.itemId);
  const recovered = await recoverIosBackgroundDownload({
    ...getActiveNotificationCopy(queueItem.input.title, queueItem.input.artist),
    artist: queueItem.input.artist,
    contentLength: prepared.contentLength,
    coverUrl: prepared.coverUrl,
    destinationPath: prepared.filePath,
    format: prepared.format,
    headers: prepared.headers,
    itemId: item.itemId,
    safeName: prepared.safeName,
    strategy: prepared.strategy,
    title: queueItem.input.title,
    url: prepared.url,
    videoId: prepared.videoId,
  });
  if (queue.runtime.cancellingIds.has(item.itemId)) {
    await cleanupFailedDownload(recovered.destinationPath);
    throw new Error('download_cancelled');
  }
  const result = await finalizeDownloadedTrack({
    contentLength: recovered.totalBytes ?? recovered.bytesWritten ?? 0,
    coverUrl: recovered.coverUrl,
    filePath: recovered.destinationPath,
    format: recovered.format,
    safeName: recovered.safeName,
    videoId: recovered.videoId,
  } satisfies DownloadFinalizeInput, queueItem.input, {
    isCancelled: () => queue.runtime.cancellingIds.has(item.itemId),
    onCancelable: (cancel) => queue.runtime.activeDownloads.set(item.itemId, { cancel }),
  });
  return result.trackId;
}

export async function finalizeCompletedBackgroundItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (!queueItem) {
    await removeOrphanCompletedFile(item.destinationPath);
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }
  if (queueItem.status === 'completed' && queueItem.trackId != null) {
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }
  const info = await FileSystem.getInfoAsync(item.destinationPath, { size: true });
  const artifactSize = info.exists && typeof info.size === 'number' ? info.size : 0;
  if (artifactSize < 1000) {
    await removeOrphanCompletedFile(item.destinationPath);
    const trackId = await recoverInvalidCompletedBackgroundItem(queue, item);
    await completeQueueItem(queue, item.itemId, trackId);
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }
  const result = await finalizeDownloadedTrack({
    contentLength: item.totalBytes ?? 0,
    coverUrl: item.coverUrl,
    filePath: item.destinationPath,
    format: item.format,
    safeName: item.safeName,
    videoId: item.videoId,
  } satisfies DownloadFinalizeInput, queueItem.input, {
    isCancelled: () => queue.runtime.cancellingIds.has(item.itemId),
    onCancelable: (cancel) => queue.runtime.activeDownloads.set(item.itemId, { cancel }),
  });
  await completeQueueItem(queue, item.itemId, result.trackId);
  await acknowledgeIosBackgroundSettled(item.itemId);
}

export async function failBackgroundItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  await endQueueItemDownloadActivity(item.itemId);
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (queueItem?.status === 'error'
      || queueItem?.status === 'retrying'
      || queueItem?.status === 'completed') {
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }
  await cleanupFailedDownload(item.destinationPath);
  await failQueueItem(queue, item.itemId, item.error ?? 'download_failed');
  await acknowledgeIosBackgroundSettled(item.itemId);
}
