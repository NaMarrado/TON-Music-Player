import { getDb } from '../database';
import type { DownloadFormat, DownloadInput } from '../downloader';
import type { QueueRow } from './types';

export async function insertQueueItemRecord(input: DownloadInput): Promise<number> {
  const db = getDb();
  const result = await db.runAsync(
    `INSERT INTO download_queue (url, source, source_id, title, artist, album, cover_url, playlist_id, duration_ms, format, quality_profile, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'm4a', ?, 'pending')`,
    [
      input.sourceUrl,
      input.source,
      input.sourceId,
      input.title,
      input.artist,
      input.album,
      input.coverUrl,
      input.playlistId,
      input.durationMs,
      input.qualityProfile ?? 'normal',
    ],
  );
  return result.lastInsertRowId;
}

export async function insertQueueItemRecords(
  inputs: DownloadInput[],
): Promise<Array<{ id: number; input: DownloadInput }>> {
  if (inputs.length === 0) {
    return [];
  }

  const db = getDb();
  const inserted: Array<{ id: number; input: DownloadInput }> = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const input of inputs) {
      const result = await txn.runAsync(
        `INSERT INTO download_queue (url, source, source_id, title, artist, album, cover_url, playlist_id, duration_ms, format, quality_profile, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'm4a', ?, 'pending')`,
        [
          input.sourceUrl,
          input.source,
          input.sourceId,
          input.title,
          input.artist,
          input.album,
          input.coverUrl,
          input.playlistId,
          input.durationMs,
          input.qualityProfile ?? 'normal',
        ],
      );

      inserted.push({
        id: result.lastInsertRowId,
        input,
      });
    }
  });

  return inserted;
}

export async function deleteQueueItemRecords(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM download_queue WHERE id IN (${placeholders})`,
      ids,
    );
  } catch {
    // non-fatal
  }
}

export async function markQueueItemRecordsCancelled(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE download_queue
       SET status = 'error',
           error_message = 'download_cancelled',
           completed_at = strftime('%s','now')
       WHERE id IN (${placeholders})`,
      ids,
    );
  } catch {
    // non-fatal
  }
}

export async function deleteCancelledQueueItemRecords(): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
      "DELETE FROM download_queue WHERE error_message = 'download_cancelled'",
    );
  } catch {
    // non-fatal
  }
}

export async function getStoredQueueRows(): Promise<QueueRow[]> {
  const db = getDb();
  return db.getAllAsync<QueueRow>(
    'SELECT * FROM download_queue ORDER BY priority DESC, created_at ASC',
  );
}

export async function getResumableQueueRows(): Promise<QueueRow[]> {
  const db = getDb();
  return db.getAllAsync<QueueRow>(
    "SELECT * FROM download_queue WHERE status IN ('pending', 'downloading', 'retrying') ORDER BY priority DESC, created_at ASC",
  );
}

export async function backfillCompletedQueueItemFormats(): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
      `UPDATE download_queue
       SET format = (
         SELECT t.format
         FROM tracks t
         WHERE t.youtube_id = download_queue.source_id
           AND t.format IS NOT NULL
           AND t.format IN ('webm', 'm4a', 'opus', 'aac', 'mp3')
         ORDER BY t.added_at DESC
         LIMIT 1
       )
       WHERE status = 'completed'
         AND source_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM tracks t
           WHERE t.youtube_id = download_queue.source_id
             AND t.format IS NOT NULL
             AND t.format IN ('webm', 'm4a', 'opus', 'aac', 'mp3')
             AND t.format != download_queue.format
         )`,
    );
  } catch {
    // non-fatal
  }
}

export async function updateQueueItemStatus(
  id: number,
  status: string,
  error?: string,
): Promise<void> {
  try {
    const db = getDb();
    if (error) {
      await db.runAsync(
        `UPDATE download_queue
         SET status = ?, error_message = ?, completed_at = NULL
         WHERE id = ?`,
        [status, error, id],
      );
      return;
    }

    await db.runAsync(
      `UPDATE download_queue
       SET status = ?,
           error_message = NULL,
           progress = CASE WHEN ? = 'completed' THEN 1 ELSE progress END,
           completed_at = CASE WHEN ? = 'completed' THEN strftime('%s','now') ELSE NULL END
       WHERE id = ?`,
      [status, status, status, id],
    );
  } catch {
    // non-fatal
  }
}

export async function updateQueueItemProgress(
  id: number,
  progress: number,
): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
      'UPDATE download_queue SET progress = ? WHERE id = ?',
      [Math.max(0, Math.min(progress, 1)), id],
    );
  } catch {
    // non-fatal
  }
}

export async function updateQueueItemFormat(
  id: number,
  format: DownloadFormat,
): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
      'UPDATE download_queue SET format = ? WHERE id = ?',
      [format, id],
    );
  } catch {
    // non-fatal
  }
}

export async function updateQueueItemRetry(
  id: number,
  retryCount: number,
): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
      'UPDATE download_queue SET retry_count = ? WHERE id = ?',
      [retryCount, id],
    );
  } catch {
    // non-fatal
  }
}

export async function claimQueueItemSettledNotification(id: number): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db.runAsync(
      `UPDATE download_queue
       SET settled_notification_sent_at = strftime('%s','now')
       WHERE id = ?
         AND status IN ('completed', 'error')
         AND settled_notification_sent_at IS NULL`,
      [id],
    );
    return result.changes > 0;
  } catch {
    return false;
  }
}

export async function requeueQueueItem(id: number): Promise<void> {
  try {
    const db = getDb();
    await db.runAsync(
      `UPDATE download_queue
       SET status = 'pending',
           progress = 0,
           error_message = NULL,
           completed_at = NULL,
           settled_notification_sent_at = NULL
       WHERE id = ?`,
      [id],
    );
  } catch {
    // non-fatal
  }
}
