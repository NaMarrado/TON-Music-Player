import type { DownloadStatus } from '@ton/core';
import { getDb } from '../database';

export function updateDownloadStatus(id: number, status: DownloadStatus): boolean {
  return getDb().prepare(
    "UPDATE download_queue SET status = ? WHERE id = ? AND status != 'cancelled'",
  ).run(status, id).changes > 0;
}

export function updateDownloadProgress(
  id: number,
  status: DownloadStatus,
  progress: number,
): boolean {
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  return getDb().prepare(
    `UPDATE download_queue SET status = ?, progress = ?
     WHERE id = ? AND status != 'cancelled'`,
  ).run(status, normalizedProgress, id).changes > 0;
}

export function persistResolvedDownload(
  id: number,
  resolved: { coverUrl: string | null; url: string; youtubeId: string },
): void {
  getDb().prepare(
    `UPDATE download_queue
     SET url = ?, resolved_source_id = ?, resolved_cover_url = ?
     WHERE id = ?`,
  ).run(resolved.url, resolved.youtubeId, resolved.coverUrl, id);
}

export function markDownloadDone(id: number, trackId: number): boolean {
  const db = getDb();
  return db.transaction((downloadId: number, importedTrackId: number) => {
    if (!Number.isInteger(importedTrackId) || importedTrackId <= 0) {
      return false;
    }

    const trackExists = db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(importedTrackId);
    if (!trackExists) {
      return false;
    }

    const completedAt = Math.floor(Date.now() / 1000);
    const completed = db.prepare(
      `UPDATE download_queue SET status = ?, progress = 1, completed_at = ?
       WHERE id = ?
         AND status IN ('pending', 'resolving', 'downloading', 'converting')
         AND completed_at IS NULL`,
    ).run('done', completedAt, downloadId);
    if (completed.changes === 0) {
      return false;
    }

    db.prepare(
      `UPDATE tracks
       SET downloaded_at = CASE
             WHEN downloaded_at IS NULL OR downloaded_at <= 0 THEN ?
             ELSE downloaded_at
           END,
           in_library = 1
       WHERE id = ?`,
    ).run(completedAt, importedTrackId);
    return true;
  })(id, trackId);
}

export function markDownloadError(id: number, message: string): void {
  getDb().prepare(
    `UPDATE download_queue
     SET status = ?, error_message = ?, retry_count = retry_count + 1
     WHERE id = ? AND status != 'cancelled'`,
  ).run('error', message, id);
}

export function markDownloadCancelled(id: number): void {
  getDb().prepare("UPDATE download_queue SET status = 'cancelled' WHERE id = ?").run(id);
}
