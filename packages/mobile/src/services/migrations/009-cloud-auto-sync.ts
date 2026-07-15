import type { SQLiteDatabase } from 'expo-sqlite';
import { createCloudAutoSyncPlaylistTriggers009 } from './009-cloud-auto-sync-playlist-triggers';
import { createCloudAutoSyncTables009 } from './009-cloud-auto-sync-tables';
import { createCloudAutoSyncTrackTriggers009 } from './009-cloud-auto-sync-track-triggers';

/**
 * Durable foreground/background cloud journal. Unscoped trigger entries are
 * adopted by the active R2 scope when a sync begins.
 */
export async function migrate009(db: SQLiteDatabase): Promise<void> {
  const trackColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(tracks)');
  if (!trackColumns.some((column) => column.name === 'downloaded_at')) {
    await db.execAsync('ALTER TABLE tracks ADD COLUMN downloaded_at INTEGER;');
  }

  const queueColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(download_queue)');
  if (!queueColumns.some((column) => column.name === 'resolved_source_id')) {
    await db.execAsync('ALTER TABLE download_queue ADD COLUMN resolved_source_id TEXT;');
  }

  await createCloudAutoSyncTables009(db);
  await createCloudAutoSyncTrackTriggers009(db);
  await createCloudAutoSyncPlaylistTriggers009(db);
}
