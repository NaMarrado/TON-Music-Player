import { getDb } from '../database';
import type { QueueRow } from './types';

const QUEUE_ROWS_WITH_SPOTIFY_POSITIONS_SQL = `
  SELECT dq.*,
    (
      SELECT GROUP_CONCAT(pii.source_position)
      FROM playlist_import_items pii
      JOIN playlist_import_sources pis ON pis.id = pii.import_source_id
      WHERE pii.queue_id = dq.id AND pis.source = 'spotify'
    ) AS spotify_playlist_positions_csv
  FROM download_queue dq`;

export async function getStoredQueueRows(): Promise<QueueRow[]> {
  return getDb().getAllAsync<QueueRow>(
    `${QUEUE_ROWS_WITH_SPOTIFY_POSITIONS_SQL}
     ORDER BY dq.priority DESC, dq.created_at ASC`,
  );
}

export async function getResumableQueueRows(): Promise<QueueRow[]> {
  return getDb().getAllAsync<QueueRow>(
    `${QUEUE_ROWS_WITH_SPOTIFY_POSITIONS_SQL}
     WHERE dq.status IN ('pending', 'downloading', 'retrying')
     ORDER BY dq.priority DESC, dq.created_at ASC`,
  );
}

export async function getSpotifyPlaylistSourcePositions(queueId: number): Promise<number[]> {
  const rows = await getDb().getAllAsync<{ source_position: number }>(
    `SELECT DISTINCT pii.source_position
     FROM playlist_import_items pii
     JOIN playlist_import_sources pis ON pis.id = pii.import_source_id
     WHERE pii.queue_id = ? AND pis.source = 'spotify'
     ORDER BY pii.source_position ASC`,
    [queueId],
  );
  return rows
    .map((row) => row.source_position + 1)
    .filter((position) => Number.isSafeInteger(position) && position > 0);
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
