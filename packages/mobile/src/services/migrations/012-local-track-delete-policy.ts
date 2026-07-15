import type { SQLiteDatabase } from 'expo-sqlite';
import { createCloudAutoSyncTrackTriggers009 } from './009-cloud-auto-sync-track-triggers';

/**
 * Local track deletion is device-local. Only the explicit R2 cleanup flow is
 * allowed to publish global track tombstones.
 */
export async function migrate012(db: SQLiteDatabase): Promise<void> {
  await createCloudAutoSyncTrackTriggers009(db);
}
