import type { SQLiteDatabase } from 'expo-sqlite';
import { createCloudAutoSyncTrackTriggers009 } from './009-cloud-auto-sync-track-triggers';

export async function migrate016(db: SQLiteDatabase): Promise<void> {
  const controlColumns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(cloud_sync_control)',
  );
  if (!controlColumns.some((column) => column.name === 'active_scope_id')) {
    await db.execAsync(
      "ALTER TABLE cloud_sync_control ADD COLUMN active_scope_id TEXT NOT NULL DEFAULT '';",
    );
  }
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cloud_sync_local_exclusions (
      scope_id TEXT NOT NULL,
      content_hash_sha256 TEXT NOT NULL,
      deleted_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, content_hash_sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_sync_local_exclusions_scope
      ON cloud_sync_local_exclusions(scope_id);
  `);
  await createCloudAutoSyncTrackTriggers009(db);
}
