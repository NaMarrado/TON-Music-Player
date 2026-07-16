import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate014(db: SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(cloud_sync_download_failures)',
  );
  if (!columns.some((column) => column.name === 'attempt_count')) {
    await db.execAsync(
      'ALTER TABLE cloud_sync_download_failures ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1;',
    );
  }
  if (!columns.some((column) => column.name === 'next_retry_at')) {
    await db.execAsync(
      'ALTER TABLE cloud_sync_download_failures ADD COLUMN next_retry_at INTEGER NOT NULL DEFAULT 0;',
    );
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_cloud_sync_download_failures_retry
      ON cloud_sync_download_failures(scope_id, manifest_revision, next_retry_at);

    UPDATE cloud_sync_state
    SET pending_downloads = MAX(
      pending_downloads,
      (SELECT COUNT(*) FROM cloud_sync_download_failures failures
       WHERE failures.scope_id = cloud_sync_state.scope_id)
    )
    WHERE EXISTS (
      SELECT 1 FROM cloud_sync_download_failures failures
      WHERE failures.scope_id = cloud_sync_state.scope_id
    );
  `);
}
