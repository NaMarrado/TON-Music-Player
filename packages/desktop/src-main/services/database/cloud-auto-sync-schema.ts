import type Database from 'better-sqlite3';
import { createCloudAutoSyncPlaylistTriggers } from './cloud-auto-sync-playlist-triggers';
import { createCloudAutoSyncTables } from './cloud-auto-sync-tables';
import { createCloudAutoSyncTrackTriggers } from './cloud-auto-sync-track-triggers';

/** Create the durable cloud-sync tables and enqueue triggers in dependency order. */
export function createCloudAutoSyncSchema(db: Database.Database): void {
  createCloudAutoSyncTables(db);
  createCloudAutoSyncTrackTriggers(db);
  createCloudAutoSyncPlaylistTriggers(db);

  const stateColumns = db.prepare("PRAGMA table_info('cloud_sync_state')").all() as Array<{ name: string }>;
  if (!stateColumns.some((column) => column.name === 'last_commit_cleanup_at')) {
    db.exec('ALTER TABLE cloud_sync_state ADD COLUMN last_commit_cleanup_at INTEGER');
  }
  if (!stateColumns.some((column) => column.name === 'activation_marker_confirmed')) {
    db.exec(`
      ALTER TABLE cloud_sync_state
      ADD COLUMN activation_marker_confirmed INTEGER NOT NULL DEFAULT 0
    `);
  }
}
