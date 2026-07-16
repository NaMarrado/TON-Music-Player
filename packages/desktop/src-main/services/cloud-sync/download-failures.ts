import type { CloudR2CleanupFailureSummary } from '@ton/core';
import { getDb } from '../database';

const FAILURE_DELETE_BATCH_SIZE = 200;

export function prepareDesktopCloudDownloadFailures(
  scopeId: string,
  manifestRevision: string,
  retryFailed: boolean,
): Set<string> {
  const db = getDb();
  db.prepare(`
    DELETE FROM cloud_sync_download_failures
    WHERE scope_id = ? AND manifest_revision != ?
  `).run(scopeId, manifestRevision);
  if (retryFailed) return new Set<string>();
  const rows = db.prepare(`
    SELECT content_hash_sha256
    FROM cloud_sync_download_failures
    WHERE scope_id = ? AND manifest_revision = ?
  `).all(scopeId, manifestRevision) as Array<{ content_hash_sha256: string }>;
  return new Set(rows.map((row) => row.content_hash_sha256));
}

export function recordDesktopCloudDownloadFailure(
  scopeId: string,
  manifestRevision: string,
  contentHash: string,
  error: unknown,
): void {
  const message = error instanceof Error && error.message
    ? error.message
    : 'cloud_sync_track_download_failed';
  getDb().prepare(`
    INSERT INTO cloud_sync_download_failures (
      scope_id, content_hash_sha256, manifest_revision, error_message, failed_at
    ) VALUES (?, ?, ?, ?, strftime('%s','now'))
    ON CONFLICT(scope_id, content_hash_sha256) DO UPDATE SET
      manifest_revision = excluded.manifest_revision,
      error_message = excluded.error_message,
      failed_at = excluded.failed_at
  `).run(scopeId, contentHash, manifestRevision, message.slice(0, 500));
}

export function clearDesktopCloudDownloadFailure(scopeId: string, contentHash: string): void {
  getDb().prepare(`
    DELETE FROM cloud_sync_download_failures
    WHERE scope_id = ? AND content_hash_sha256 = ?
  `).run(scopeId, contentHash);
}

export function listDesktopCloudDownloadFailures(
  scopeId: string,
): CloudR2CleanupFailureSummary[] {
  const rows = getDb().prepare(`
    SELECT content_hash_sha256, error_message, failed_at
    FROM cloud_sync_download_failures
    WHERE scope_id = ?
    ORDER BY failed_at DESC, content_hash_sha256 ASC
  `).all(scopeId) as Array<{
    content_hash_sha256: string;
    error_message: string;
    failed_at: number;
  }>;
  return rows.map((row) => ({
    contentHash: row.content_hash_sha256.toLowerCase(),
    errorMessage: row.error_message,
    failedAt: row.failed_at,
  }));
}

export function clearDesktopCloudDownloadFailures(
  scopeId: string,
  contentHashes: string[],
): void {
  const uniqueHashes = [...new Set(contentHashes.map((hash) => hash.toLowerCase()))];
  if (uniqueHashes.length === 0) return;
  const db = getDb();
  db.transaction(() => {
    for (let offset = 0; offset < uniqueHashes.length; offset += FAILURE_DELETE_BATCH_SIZE) {
      const batch = uniqueHashes.slice(offset, offset + FAILURE_DELETE_BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(', ');
      db.prepare(`
        DELETE FROM cloud_sync_download_failures
        WHERE scope_id = ? AND content_hash_sha256 IN (${placeholders})
      `).run(scopeId, ...batch);
    }
  })();
}
