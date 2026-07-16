import type { DownloadItem, DownloadRequest } from '@ton/core';
import { getDb } from '../database';

function resolveQualityProfile(request: DownloadRequest): DownloadItem['quality_profile'] {
  if (request.quality_profile === 'best_compatible') {
    return request.quality_profile;
  }

  const row = getDb().prepare(
    "SELECT value FROM settings WHERE key = 'download_quality_profile'",
  ).get() as { value: string } | undefined;
  return row?.value === 'best_compatible' ? 'best_compatible' : 'normal';
}

export function resumeInterruptedDownloads(): void {
  getDb().prepare(
    `UPDATE download_queue SET status = 'pending', progress = 0
     WHERE status IN ('downloading', 'resolving', 'converting')`,
  ).run();
}

export function insertDownloadRequest(request: DownloadRequest): number {
  const result = getDb().prepare(
    `INSERT INTO download_queue (
      url, source, source_id, title, artist, album,
      cover_url, playlist_id, duration_ms, format, quality_profile, status, priority
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    request.url || null,
    request.source,
    request.source_id || null,
    request.title || null,
    request.artist || null,
    request.album || null,
    request.cover_url || null,
    request.playlist_id || null,
    request.duration_ms ?? null,
    'm4a',
    resolveQualityProfile(request),
    0,
  );

  return Number(result.lastInsertRowid);
}

export function markDownloadCancelled(id: number): void {
  getDb().prepare(
    "UPDATE download_queue SET status = 'cancelled' WHERE id = ? AND status NOT IN ('done', 'cancelled')",
  ).run(id);
}

export function markAllCancellableDownloadsCancelled(): void {
  getDb().prepare(
    `UPDATE download_queue
     SET status = 'cancelled', error_message = NULL
     WHERE status IN ('pending', 'downloading', 'resolving', 'converting')`,
  ).run();
}

export function resetDownloadForRetry(id: number): void {
  getDb().prepare(
    `UPDATE download_queue
     SET status = 'pending',
         progress = 0,
         error_message = NULL,
         retry_count = 0,
         url = CASE WHEN source = 'spotify' THEN NULL ELSE url END,
         resolved_source_id = CASE WHEN source = 'spotify' THEN NULL ELSE resolved_source_id END,
         resolved_cover_url = CASE WHEN source = 'spotify' THEN NULL ELSE resolved_cover_url END
     WHERE id = ?`,
  ).run(id);
}

export function requeueDownloadAfterFailure(id: number): void {
  getDb().prepare(
    `UPDATE download_queue
     SET status = 'pending',
         progress = 0,
         error_message = NULL,
         retry_count = retry_count + 1,
         url = CASE WHEN source = 'spotify' THEN NULL ELSE url END,
         resolved_source_id = CASE WHEN source = 'spotify' THEN NULL ELSE resolved_source_id END,
         resolved_cover_url = CASE WHEN source = 'spotify' THEN NULL ELSE resolved_cover_url END
     WHERE id = ? AND status NOT IN ('done', 'cancelled')`,
  ).run(id);
}

export function clearCompletedDownloads(): void {
  getDb().prepare("DELETE FROM download_queue WHERE status = 'done'").run();
}

export function clearFailedDownloads(): void {
  getDb().prepare("DELETE FROM download_queue WHERE status IN ('error', 'cancelled')").run();
}

export function clearNonActiveDownloads(): void {
  getDb().prepare(
    "DELETE FROM download_queue WHERE status IN ('done', 'cancelled', 'error')",
  ).run();
}

export function listDownloads(): DownloadItem[] {
  return getDb().prepare(
    'SELECT * FROM download_queue ORDER BY priority DESC, created_at ASC',
  ).all() as DownloadItem[];
}

export function countPendingOrActiveDownloads(): number {
  const row = getDb().prepare(
    "SELECT COUNT(*) as c FROM download_queue WHERE status IN ('pending', 'downloading', 'resolving', 'converting')",
  ).get() as { c: number };
  return row.c;
}

export function resetDownloadsToPending(ids: Iterable<number>): void {
  const statement = getDb().prepare(
    "UPDATE download_queue SET status = 'pending', progress = 0 WHERE id = ?",
  );

  for (const id of ids) {
    statement.run(id);
  }
}

export function getNextPendingDownload(excludedIds: Iterable<number> = []): DownloadItem | undefined {
  const excluded = [...excludedIds].filter(Number.isInteger);
  const exclusion = excluded.length > 0
    ? ` AND id NOT IN (${excluded.map(() => '?').join(', ')})`
    : '';
  return getDb().prepare(
    `SELECT * FROM download_queue
     WHERE status = 'pending'${exclusion}
     ORDER BY priority DESC, created_at ASC
     LIMIT 1`,
  ).get(...excluded) as DownloadItem | undefined;
}

export function markDownloadAsStarting(id: number): void {
  getDb().prepare("UPDATE download_queue SET status = 'downloading' WHERE id = ?").run(id);
}
