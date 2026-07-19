import type { CloudR2CleanupFailureSummary } from '@ton/core';
import { getCloudDownloadRetryDelaySeconds } from './download-failure-policy';
import { runMobileCloudDbLane } from './db-lane';

const FAILURE_DELETE_BATCH_SIZE = 200;

export interface MobileCloudDownloadFailureContext {
  scopeId: string;
  manifestRevision: string;
  retryFailed: boolean;
}

export async function prepareMobileCloudDownloadFailures(
  context: MobileCloudDownloadFailureContext,
): Promise<Set<string>> {
  return runMobileCloudDbLane(async (db) => {
    await db.runAsync(
      `DELETE FROM cloud_sync_download_failures
       WHERE scope_id = ? AND manifest_revision != ?`,
      [context.scopeId, context.manifestRevision],
    );
    if (context.retryFailed) return new Set<string>();
    const rows = await db.getAllAsync<{ content_hash_sha256: string }>(
      `SELECT content_hash_sha256
       FROM cloud_sync_download_failures
       WHERE scope_id = ? AND manifest_revision = ?
         AND next_retry_at > strftime('%s','now')`,
      [context.scopeId, context.manifestRevision],
    );
    return new Set(rows.map((row) => row.content_hash_sha256));
  });
}

export async function recordMobileCloudDownloadFailure(
  context: MobileCloudDownloadFailureContext,
  contentHash: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error && error.message
    ? error.message
    : 'cloud_sync_track_download_failed';
  await runMobileCloudDbLane(async (db) => db.withExclusiveTransactionAsync(async (txn) => {
    const previous = await txn.getFirstAsync<{
      manifest_revision: string;
      attempt_count: number;
    }>(
      `SELECT manifest_revision, attempt_count
       FROM cloud_sync_download_failures
       WHERE scope_id = ? AND content_hash_sha256 = ?`,
      [context.scopeId, contentHash],
    );
    const attemptCount = previous?.manifest_revision === context.manifestRevision
      ? Math.min(30, previous.attempt_count + 1)
      : 1;
    const failedAt = Math.floor(Date.now() / 1000);
    const nextRetryAt = failedAt + getCloudDownloadRetryDelaySeconds(attemptCount);
    await txn.runAsync(
      `INSERT INTO cloud_sync_download_failures(
         scope_id, content_hash_sha256, manifest_revision, error_message,
         failed_at, attempt_count, next_retry_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope_id, content_hash_sha256) DO UPDATE SET
         manifest_revision = excluded.manifest_revision,
         error_message = excluded.error_message,
         failed_at = excluded.failed_at,
         attempt_count = excluded.attempt_count,
         next_retry_at = excluded.next_retry_at`,
      [
        context.scopeId, contentHash, context.manifestRevision, message.slice(0, 500),
        failedAt, attemptCount, nextRetryAt,
      ],
    );
  }));
}

export async function countMobileCloudDownloadFailures(
  scopeId: string,
  manifestRevision: string,
): Promise<number> {
  const row = await runMobileCloudDbLane((db) => db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM cloud_sync_download_failures
     WHERE scope_id = ? AND manifest_revision = ?`,
    [scopeId, manifestRevision],
  ));
  return row?.count ?? 0;
}

export async function clearMobileCloudDownloadFailure(
  context: MobileCloudDownloadFailureContext,
  contentHash: string,
): Promise<void> {
  await runMobileCloudDbLane((db) => db.runAsync(
    `DELETE FROM cloud_sync_download_failures
     WHERE scope_id = ? AND content_hash_sha256 = ?`,
    [context.scopeId, contentHash],
  ).then(() => undefined));
}

export async function listMobileCloudDownloadFailures(
  scopeId: string,
): Promise<CloudR2CleanupFailureSummary[]> {
  const rows = await runMobileCloudDbLane((db) => db.getAllAsync<{
    content_hash_sha256: string;
    error_message: string;
    failed_at: number;
  }>(
    `SELECT content_hash_sha256, error_message, failed_at
     FROM cloud_sync_download_failures
     WHERE scope_id = ?
     ORDER BY failed_at DESC, content_hash_sha256 ASC`,
    [scopeId],
  ));
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
  await runMobileCloudDbLane(async (db) => {
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
  });
}
