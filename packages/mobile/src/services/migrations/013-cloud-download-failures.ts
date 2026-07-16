import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate013(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cloud_sync_download_failures (
      scope_id TEXT NOT NULL,
      content_hash_sha256 TEXT NOT NULL,
      manifest_revision TEXT NOT NULL,
      error_message TEXT NOT NULL,
      failed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, content_hash_sha256)
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_sync_download_failures_revision
      ON cloud_sync_download_failures(scope_id, manifest_revision);
  `);
}
