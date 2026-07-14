import { getDb } from '../database';
import type { DownloadFormat } from '../downloader';

export async function updateQueueItemStatus(
  id: number,
  status: string,
  error?: string,
): Promise<void> {
  try {
    if (error) {
      await getDb().runAsync(
        `UPDATE download_queue SET status = ?, error_message = ?, completed_at = NULL WHERE id = ?`,
        [status, error, id],
      );
    } else {
      await getDb().runAsync(
        `UPDATE download_queue SET status = ?, error_message = NULL,
         progress = CASE WHEN ? = 'completed' THEN 1 ELSE progress END,
         completed_at = CASE WHEN ? = 'completed' THEN strftime('%s','now') ELSE NULL END
         WHERE id = ?`,
        [status, status, status, id],
      );
    }
  } catch { /* non-fatal */ }
}

export async function completeQueueItemRecord(id: number, trackId: number): Promise<boolean> {
  const completedAt = Math.floor(Date.now() / 1000);
  let completed = false;
  await getDb().withExclusiveTransactionAsync(async (db) => {
    const queueResult = await db.runAsync(
      `UPDATE download_queue SET status = 'completed', error_message = NULL,
       progress = 1, completed_at = ?, resolved_source_id = (
         SELECT youtube_id FROM tracks WHERE id = ?
       ) WHERE id = ? AND status IN ('pending', 'downloading', 'retrying')
         AND completed_at IS NULL AND COALESCE(error_message, '') != 'download_cancelled'`,
      [completedAt, trackId, id],
    );
    if (queueResult.changes !== 1) return;
    const trackResult = await db.runAsync(
      `UPDATE tracks SET downloaded_at = CASE
        WHEN downloaded_at IS NULL OR downloaded_at <= 0 THEN ? ELSE downloaded_at END,
       in_library = 1 WHERE id = ?`,
      [completedAt, trackId],
    );
    if (trackResult.changes !== 1) throw new Error('download_track_missing');
    completed = true;
  });
  return completed;
}

async function updateValue(sql: string, values: unknown[]): Promise<void> {
  try { await getDb().runAsync(sql, values); }
  catch { /* non-fatal */ }
}

export function updateQueueItemProgress(id: number, progress: number): Promise<void> {
  return updateValue(
    'UPDATE download_queue SET progress = ? WHERE id = ?',
    [Math.max(0, Math.min(progress, 1)), id],
  );
}

export function updateQueueItemFormat(id: number, format: DownloadFormat): Promise<void> {
  return updateValue('UPDATE download_queue SET format = ? WHERE id = ?', [format, id]);
}

export function updateQueueItemRetry(id: number, retryCount: number): Promise<void> {
  return updateValue('UPDATE download_queue SET retry_count = ? WHERE id = ?', [retryCount, id]);
}

export async function claimQueueItemSettledNotification(id: number): Promise<boolean> {
  try {
    const result = await getDb().runAsync(
      `UPDATE download_queue SET settled_notification_sent_at = strftime('%s','now')
       WHERE id = ? AND status IN ('completed', 'error')
         AND settled_notification_sent_at IS NULL`,
      [id],
    );
    return result.changes > 0;
  } catch { return false; }
}

export async function requeueQueueItem(id: number): Promise<void> {
  await updateValue(
    `UPDATE download_queue SET status = 'pending', progress = 0, error_message = NULL,
     completed_at = NULL, settled_notification_sent_at = NULL WHERE id = ?`,
    [id],
  );
}
