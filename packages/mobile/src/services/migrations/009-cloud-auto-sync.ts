import type { SQLiteDatabase } from 'expo-sqlite';
import { createCloudAutoSyncPlaylistTriggers009 } from './009-cloud-auto-sync-playlist-triggers';
import { createCloudAutoSyncTables009 } from './009-cloud-auto-sync-tables';
import { createCloudAutoSyncTrackTriggers009 } from './009-cloud-auto-sync-track-triggers';

/**
 * Durable foreground/background cloud journal. Unscoped trigger entries are
 * adopted by the active R2 scope when a sync begins.
 */
export async function migrate009(db: SQLiteDatabase): Promise<void> {
  await createCloudAutoSyncTables009(db);
  await createCloudAutoSyncTrackTriggers009(db);
  await createCloudAutoSyncPlaylistTriggers009(db);
}
