import { getDb } from '../database';
import type { CloudR2CleanupFailureSummary } from '@ton/core';

const FAILURE_DELETE_BATCH_SIZE = 200;

export interface MobileCloudDownloadFailureContext {
  scopeId: string;
  manifestRevision: string;
  retryFailed: boolean;
}

export async function prepareMobileCloudDownloadFailures(
  context: MobileCloudDownloadFailureContext,
): Promise<Set<string>> {
  const db = getDb();
  await db.runAsync(
    `DELETE FROM cloud_sync_download_failures
     WHERE scope_id = ? AND manifest_revision != ?`,
    [context.scopeId, context.manifestRevision],
  );
  if (context.retryFailed) return new Set<string>();
  const rows = await db.getAllAsync<{ content_hash_sha256: string }>(
    `SELECT content_hash_sha256
     FROM cloud_sync_download_failures
     WHERE scope_id = ? AND manifest_revision = ?`,
    [context.scopeId, context.manifestRevision],
  );
  return new Set(rows.map((row) => row.content_hash_sha256));
}

export async function recordMobileCloudDownloadFailure(
  context: MobileCloudDownloadFailureContext,
  contentHash: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error && error.message
    ? error.message
    : 'cloud_sync_track_download_failed';
  await getDb().runAsync(
    `INSERT INTO cloud_sync_download_failures(
       scope_id, content_hash_sha256, manifest_revision, error_message, failed_at
     ) VALUES (?, ?, ?, ?, strftime('%s','now'))
     ON CONFLICT(scope_id, content_hash_sha256) DO UPDATE SET
       manifest_revision = excluded.manifest_revision,
       error_message = excluded.error_message,
       failed_at = excluded.failed_at`,
    [context.scopeId, contentHash, context.manifestRevision, message.slice(0, 500)],
  );
}

export async function clearMobileCloudDownloadFailure(
  context: MobileCloudDownloadFailureContext,
  contentHash: string,
): Promise<void> {
  await getDb().runAsync(
    `DELETE FROM cloud_sync_download_failures
     WHERE scope_id = ? AND content_hash_sha256 = ?`,
    [context.scopeId, contentHash],
  );
}

export async function listMobileCloudDownloadFailures(
  scopeId: string,
): Promise<CloudR2CleanupFailureSummary[]> {
  const rows = await getDb().getAllAsync<{
    content_hash_sha256: string;
    error_message: string;
    failed_at: number;
  }>(
    `SELECT content_hash_sha256, error_message, failed_at
     FROM cloud_sync_download_failures
     WHERE scope_id = ?
     ORDER BY failed_at DESC, content_hash_sha256 ASC`,
    [scopeId],
  );
  return rows.map((row) => ({
    contentHash: row.content_hash_sha256.toLowerCase(),
    errorMessage: row.error_message,
    failedAt: row.failed_at,
  }));
}

export async function clearMobileCloudDownloadFailures(
  scopeId: string,
  contentHashes: string[],
): Promise<void> {
  const uniqueHashes = [...new Set(contentHashes.map((hash) => hash.toLowerCase()))];
  if (uniqueHashes.length === 0) return;
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (let offset = 0; offset < uniqueHashes.length; offset += FAILURE_DELETE_BATCH_SIZE) {
      const batch = uniqueHashes.slice(offset, offset + FAILURE_DELETE_BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(', ');
      await db.runAsync(
        `DELETE FROM cloud_sync_download_failures
         WHERE scope_id = ? AND content_hash_sha256 IN (${placeholders})`,
        [scopeId, ...batch],
      );
    }
  });
}
