import type { SQLiteDatabase } from 'expo-sqlite';

export async function createCloudAutoSyncTables009(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cloud_sync_state (
      scope_id TEXT PRIMARY KEY, revision TEXT, etag TEXT,
      lamport_counter INTEGER NOT NULL DEFAULT 0,
      last_success_at INTEGER, last_error TEXT, next_retry_at INTEGER,
      last_cleanup_at INTEGER,
      needs_full_reconcile INTEGER NOT NULL DEFAULT 1,
      pending_downloads INTEGER NOT NULL DEFAULT 0,
      pending_assets INTEGER NOT NULL DEFAULT 0,
      activation_marker_confirmed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_entities (
      scope_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('track', 'playlist')),
      entity_key TEXT NOT NULL,
      version_counter INTEGER NOT NULL,
      version_device_id TEXT NOT NULL,
      record_json TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, entity_type, entity_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
      scope_id TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL CHECK(entity_type IN ('track', 'playlist')),
      entity_key TEXT NOT NULL,
      local_id INTEGER,
      operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
      payload_json TEXT,
      generation INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, entity_type, entity_key)
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_generation
      ON cloud_sync_outbox(scope_id, generation);

    CREATE TABLE IF NOT EXISTS cloud_sync_blob_gc (
      scope_id TEXT NOT NULL, object_key TEXT NOT NULL, eligible_at INTEGER NOT NULL,
      PRIMARY KEY (scope_id, object_key)
    );
    CREATE INDEX IF NOT EXISTS idx_cloud_sync_blob_gc_eligible
      ON cloud_sync_blob_gc(scope_id, eligible_at);

    CREATE TABLE IF NOT EXISTS cloud_sync_hash_cache (
      file_path TEXT PRIMARY KEY, file_size INTEGER NOT NULL, file_mtime REAL NOT NULL,
      sha256 TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_control (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      generation INTEGER NOT NULL DEFAULT 0,
      suppress_outbox INTEGER NOT NULL DEFAULT 0,
      lease_owner TEXT,
      lease_expires_at INTEGER
    );
    INSERT OR IGNORE INTO cloud_sync_control(id) VALUES (1);

    UPDATE playlists SET cloud_id = 'playlist-' || lower(hex(randomblob(16)))
    WHERE cloud_id IS NULL OR cloud_id = '';

    DROP TRIGGER IF EXISTS playlists_cloud_id_insert;
    CREATE TRIGGER playlists_cloud_id_insert
    AFTER INSERT ON playlists
    WHEN NEW.cloud_id IS NULL OR NEW.cloud_id = ''
    BEGIN
      UPDATE playlists SET cloud_id = 'playlist-' || lower(hex(randomblob(16)))
      WHERE id = NEW.id;
    END;
  `);
}
