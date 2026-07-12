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

export function markDownloadDone(id: number): boolean {
  return getDb().prepare(
    `UPDATE download_queue SET status = ?, progress = 1, completed_at = ?
     WHERE id = ? AND status != 'cancelled'`,
  ).run('done', Math.floor(Date.now() / 1000), id).changes > 0;
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
