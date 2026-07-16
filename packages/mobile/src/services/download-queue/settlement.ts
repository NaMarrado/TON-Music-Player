import {
  DOWNLOAD_RETRY_MAX,
  toDownloadFailureMessage,
} from '@ton/core';
import {
  completeQueueItemRecord,
  getSpotifyPlaylistSourcePositions,
  requeueQueueItem,
  updateQueueItemFormat,
  updateQueueItemRetry,
  updateQueueItemStatus,
} from './db';
import { shouldRetryQueueFailure } from './failure-policy';
import { getRetryDelay } from './timing';
import { clearProgressTracking } from './progress';
import type { QueueRuntimeState } from './runtime';
import { replaceQueueItem, updateQueueItem } from './mutations';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { mergeCompletedTrackIntoPlaylists } from '../../stores/playlist-store';
import { getTrackById } from '../db-queries';
import type { DownloadFormat } from '../downloader';
import { settlePlaylistImportQueueItem } from '../playlist-import/targets';

const CANCELLED_ERROR_MESSAGE = 'download_cancelled';
const DOWNLOAD_FORMATS = new Set<string>(['webm', 'm4a', 'opus', 'aac', 'mp3']);

function asDownloadFormat(format: string | null | undefined): DownloadFormat | null {
  return format && DOWNLOAD_FORMATS.has(format) ? format as DownloadFormat : null;
}

export interface QueueSettlementFacade {
  runtime: QueueRuntimeState;
  notify: () => void;
  processNext: () => void;
}

export function isCancelledQueueItem(
  queue: QueueSettlementFacade,
  itemId: number,
  message: string,
): boolean {
  return message === CANCELLED_ERROR_MESSAGE || queue.runtime.cancellingIds.has(itemId);
}

export async function completeQueueItem(
  queue: QueueSettlementFacade,
  itemId: number,
  trackId: number,
): Promise<void> {
  const { runtime } = queue;
  const track = await getTrackById(trackId).catch(() => null);
  const format = asDownloadFormat(track?.format);

  console.log('[DL-QUEUE] Download completed item:', itemId);
  if (runtime.cancellingIds.has(itemId)) {
    clearProgressTracking(runtime, itemId);
    runtime.activeDownloads.delete(itemId);
    return;
  }
  if (format) {
    await updateQueueItemFormat(itemId, format);
  }
  const completed = await completeQueueItemRecord(itemId, trackId);
  clearProgressTracking(runtime, itemId);
  runtime.activeDownloads.delete(itemId);
  if (!completed) {
    return;
  }
  updateQueueItem(runtime, itemId, (current) => ({
    ...current,
    status: 'completed',
    progress: 1,
    error: null,
    format: format ?? current.format,
    trackId,
  }));
  const affectedPlaylistIds = await settlePlaylistImportQueueItem(itemId, trackId);
  await mergeCompletedTrackIntoPlaylists(trackId, affectedPlaylistIds);

  await reconcileLibraryTracks().catch(() => {});
}

export async function failQueueItem(
  queue: QueueSettlementFacade,
  itemId: number,
  message: string,
): Promise<void> {
  const { runtime } = queue;
  runtime.activeDownloads.delete(itemId);

  if (isCancelledQueueItem(queue, itemId, message)) {
    clearProgressTracking(runtime, itemId);
    return;
  }

  const displayMessage = toDownloadFailureMessage(message);
  console.log('[DL-QUEUE] Download FAILED: item', itemId, message);

  const current = runtime.items.find((entry) => entry.id === itemId);
  if (!current) {
    return;
  }

  if (current.retryCount < DOWNLOAD_RETRY_MAX && shouldRetryQueueFailure(message)) {
    const nextRetryCount = current.retryCount + 1;
    clearProgressTracking(runtime, itemId);
    updateQueueItem(runtime, itemId, (existing) => ({
      ...existing,
      retryCount: nextRetryCount,
      status: 'retrying',
      progress: 0,
      error: displayMessage,
    }));
    await updateQueueItemStatus(itemId, 'retrying', displayMessage);
    await updateQueueItemRetry(itemId, nextRetryCount);
    queue.notify();

    setTimeout(() => {
      const latest = runtime.items.find((entry) => entry.id === itemId);
      if (!latest || latest.status !== 'retrying') {
        return;
      }

      replaceQueueItem(runtime, itemId, {
        ...latest,
        status: 'pending',
        progress: 0,
        error: null,
      });
      clearProgressTracking(runtime, itemId);
      void requeueQueueItem(itemId);
      queue.notify();
      queue.processNext();
    }, getRetryDelay());
    return;
  }

  const playlistSourcePositions = await getSpotifyPlaylistSourcePositions(itemId);
  clearProgressTracking(runtime, itemId);
  updateQueueItem(runtime, itemId, (existing) => ({
    ...existing,
    status: 'error',
    progress: 0,
    error: displayMessage,
    playlistSourcePositions,
  }));
  await updateQueueItemStatus(itemId, 'error', displayMessage);
}
