import { isAgeRestrictedDownloadError } from '@ton/core';
import { prepareDownloadSource } from '../downloader';
import { cleanupFailedDownload } from '../downloader/filesystem';
import { invalidatePoToken } from '../po-token-service';
import { resetPlayerClient } from '../youtube-search/client';
import {
  recoverIosBackgroundDownload,
  type IosBackgroundDownloadSnapshotItem,
} from '../download-runtime/ios-background-session';
import { updateQueueItemFormat, updateQueueItemProgress, updateQueueItemStatus } from './db';
import {
  attachActiveHandle,
  beginQueueItemDownloadActivity,
  clearFailedStrategies,
  getActiveNotificationCopy,
  getFailedStrategies,
  releaseActiveSlot,
  rememberFailedStrategy,
} from './ios-background-activity';
import { finalizeCompletedBackgroundItem } from './ios-background-finalize';
import { iosBackgroundState as state, type IosBackgroundQueueFacade } from './ios-background-state';
import { updateQueueItem } from './mutations';
import { markQueueItemActive } from './runtime';

const NATIVE_CANDIDATE_REJECTION_RE = /\bHTTP 4\d\d\b|unexpected content type/i;

export function createFailedCandidateSnapshotItem(
  itemId: number,
  queueItem: IosBackgroundQueueFacade['runtime']['items'][number],
  error: string,
  prepared: Awaited<ReturnType<typeof prepareDownloadSource>> | null,
): IosBackgroundDownloadSnapshotItem {
  return {
    artist: queueItem.input.artist,
    bytesWritten: 0,
    coverUrl: prepared?.coverUrl ?? queueItem.input.coverUrl,
    destinationPath: prepared?.filePath ?? '',
    error,
    format: prepared?.format ?? 'm4a',
    headers: prepared?.headers,
    itemId,
    progress: 0,
    safeName: prepared?.safeName ?? queueItem.input.title,
    state: 'failed',
    strategy: prepared?.strategy ?? null,
    title: queueItem.input.title,
    totalBytes: prepared?.contentLength ?? null,
    url: prepared?.url ?? queueItem.input.sourceUrl,
    videoId: prepared?.videoId ?? queueItem.input.sourceId,
  };
}

function combineCandidateErrors(originalError: string | null | undefined, nextError: unknown): string {
  const prefix = originalError?.trim() ? originalError : 'download_failed';
  const message = nextError instanceof Error && nextError.message.trim()
    ? nextError.message
    : String(nextError);
  return `${prefix}; next candidate failed: ${message}`;
}

export async function recoverPreparedIosQueueItem(
  queue: IosBackgroundQueueFacade,
  itemId: number,
  queueItem: IosBackgroundQueueFacade['runtime']['items'][number],
  prepared: Awaited<ReturnType<typeof prepareDownloadSource>>,
): Promise<void> {
  updateQueueItem(queue.runtime, itemId, (current) => ({ ...current, format: prepared.format }));
  await updateQueueItemFormat(itemId, prepared.format);
  state.foregroundPromiseItemIds.add(itemId);
  try {
    const completedItem = await recoverIosBackgroundDownload({
      ...getActiveNotificationCopy(queueItem.input.title, queueItem.input.artist),
      artist: queueItem.input.artist,
      contentLength: prepared.contentLength,
      coverUrl: prepared.coverUrl,
      destinationPath: prepared.filePath,
      format: prepared.format,
      headers: prepared.headers,
      itemId,
      safeName: prepared.safeName,
      strategy: prepared.strategy,
      title: queueItem.input.title,
      url: prepared.url,
      videoId: prepared.videoId,
    });
    if (queue.runtime.cancellingIds.has(itemId)) {
      await cleanupFailedDownload(completedItem.destinationPath);
      throw new Error('download_cancelled');
    }
    await finalizeCompletedBackgroundItem(queue, completedItem);
    clearFailedStrategies(itemId);
  } finally {
    state.foregroundPromiseItemIds.delete(itemId);
  }
}

export async function tryStartNextIosBackgroundCandidate(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<boolean> {
  if (isAgeRestrictedDownloadError(item.error)) return false;
  if (!item.error || !NATIVE_CANDIDATE_REJECTION_RE.test(item.error)) return false;
  const existingRetry = state.candidateRetryPromisesByItemId.get(item.itemId);
  if (existingRetry) {
    const restarted = await existingRetry;
    if (!restarted) item.error = state.candidateRetryErrorsByItemId.get(item.itemId) ?? item.error;
    return restarted;
  }
  const retry = tryStartNextCandidateOnce(queue, item)
    .finally(() => state.candidateRetryPromisesByItemId.delete(item.itemId));
  state.candidateRetryPromisesByItemId.set(item.itemId, retry);
  return retry;
}

async function tryStartNextCandidateOnce(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<boolean> {
  await cleanupFailedDownload(item.destinationPath);
  invalidatePoToken({ binding: 'video', videoId: item.videoId });
  resetPlayerClient();
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (!queueItem) return false;
  rememberFailedStrategy(item.itemId, item.strategy);
  await beginQueueItemDownloadActivity(item.itemId, queueItem);
  let prepared: Awaited<ReturnType<typeof prepareDownloadSource>>;
  try {
    prepared = await prepareDownloadSource(queueItem.input, {
      skipStrategies: getFailedStrategies(item.itemId),
    });
  } catch (error) {
    item.error = combineCandidateErrors(item.error, error);
    state.candidateRetryErrorsByItemId.set(item.itemId, item.error);
    return false;
  }
  updateQueueItem(queue.runtime, item.itemId, (current) => ({
    ...current, status: 'downloading', progress: 0, error: null,
  }));
  queue.runtime.persistedProgress.set(item.itemId, 0);
  await updateQueueItemStatus(item.itemId, 'downloading');
  await updateQueueItemProgress(item.itemId, 0);
  const alreadyActive = queue.runtime.activeItemIds.has(item.itemId);
  if (!alreadyActive) markQueueItemActive(queue.runtime, item.itemId);
  attachActiveHandle(queue, item.itemId);
  try {
    await recoverPreparedIosQueueItem(queue, item.itemId, queueItem, prepared);
    releaseActiveSlot(queue, item.itemId);
    queue.notify();
    queue.processNext();
  } catch (error) {
    rememberFailedStrategy(item.itemId, prepared.strategy);
    item.error = combineCandidateErrors(item.error, error);
    state.candidateRetryErrorsByItemId.set(item.itemId, item.error);
    if (!alreadyActive) releaseActiveSlot(queue, item.itemId);
    return false;
  }
  state.candidateRetryErrorsByItemId.delete(item.itemId);
  queue.notify();
  return true;
}
