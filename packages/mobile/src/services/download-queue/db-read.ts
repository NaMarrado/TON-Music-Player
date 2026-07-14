import { getDb } from '../database';
import type { QueueRow } from './types';

export async function getStoredQueueRows(): Promise<QueueRow[]> {
  return getDb().getAllAsync<QueueRow>(
    'SELECT * FROM download_queue ORDER BY priority DESC, created_at ASC',
  );
}

export async function getResumableQueueRows(): Promise<QueueRow[]> {
  return getDb().getAllAsync<QueueRow>(
    `SELECT * FROM download_queue WHERE status IN ('pending', 'downloading', 'retrying')
     ORDER BY priority DESC, created_at ASC`,
  );
}

export async function backfillCompletedQueueItemFormats(): Promise<void> {
  try {
    await getDb().runAsync(
      `UPDATE download_queue SET format = (
        SELECT t.format FROM tracks t
        WHERE t.youtube_id = download_queue.source_id
          AND t.format IN ('webm', 'm4a', 'opus', 'aac', 'mp3')
        ORDER BY t.added_at DESC LIMIT 1
      ) WHERE status = 'completed' AND source_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tracks t WHERE t.youtube_id = download_queue.source_id
          AND t.format IN ('webm', 'm4a', 'opus', 'aac', 'mp3')
          AND t.format != download_queue.format
      )`,
    );
  } catch { /* non-fatal */ }
}
