import type { DownloadInput } from '../downloader';
import type { QueueItem, QueueRow } from './types';

function normalizeHydratedStatus(status: string): QueueItem['status'] {
  if (
    status === 'pending'
    || status === 'downloading'
    || status === 'retrying'
    || status === 'completed'
    || status === 'error'
  ) {
    return status;
  }

  return 'pending';
}

export function createPendingQueueItem(
  id: number,
  input: DownloadInput,
): QueueItem {
  return {
    id,
    input,
    status: 'pending',
    progress: 0,
    error: null,
    format: null,
    retryCount: 0,
    trackId: null,
  };
}

export function hydrateQueueItem(row: QueueRow): QueueItem {
  const normalizedStatus = normalizeHydratedStatus(row.status);

  return {
    id: row.id,
    input: {
      source: row.source,
      sourceId: row.source_id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationMs: row.duration_ms ?? 0,
      coverUrl: row.cover_url,
      sourceUrl: row.url || '',
      playlistId: row.playlist_id,
      qualityProfile: row.quality_profile === 'best_compatible' ? 'best_compatible' : 'normal',
    },
    status: normalizedStatus,
    progress: Math.max(
      0,
      Math.min(row.progress ?? 0, normalizedStatus === 'completed' ? 1 : 0.99),
    ),
    error: row.error_message,
    format: row.format,
    retryCount: row.retry_count,
    trackId: null,
  };
}

export function isQueueItemActive(item: QueueItem): boolean {
  return item.status === 'downloading' || item.status === 'pending' || item.status === 'retrying';
}
