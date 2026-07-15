import type Database from 'better-sqlite3';

export function createCloudAutoSyncTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_sync_state (
      scope_id TEXT PRIMARY KEY, revision TEXT, etag TEXT,
      lamport_counter INTEGER NOT NULL DEFAULT 0,
      last_success_at INTEGER, last_error TEXT, next_retry_at INTEGER,
      needs_full_reconcile INTEGER NOT NULL DEFAULT 1,
      pending_remote_revision TEXT,
      pending_downloads INTEGER NOT NULL DEFAULT 0,
      last_commit_cleanup_at INTEGER,
      activation_marker_confirmed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_entities (
      scope_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('track', 'playlist')),
      entity_key TEXT NOT NULL,
      record_json TEXT NOT NULL,
      version_counter INTEGER NOT NULL DEFAULT 0,
      version_device_id TEXT NOT NULL DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, entity_type, entity_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
      id INTEGER PRIMARY KEY,
      scope_id TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL CHECK (entity_type IN ('track', 'playlist', 'library')),
      entity_key TEXT NOT NULL,
      local_id INTEGER,
      operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete', 'reconcile')),
      payload_json TEXT,
      generation INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE (scope_id, entity_type, entity_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_control (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_scope_id TEXT NOT NULL DEFAULT '',
      generation INTEGER NOT NULL DEFAULT 0,
      suppress_outbox INTEGER NOT NULL DEFAULT 0,
      lease_owner TEXT,
      lease_expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_blob_gc (
      scope_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      eligible_at INTEGER NOT NULL,
      PRIMARY KEY (scope_id, object_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_hash_cache (
      file_path TEXT PRIMARY KEY,
      file_size INTEGER NOT NULL,
      file_mtime INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    INSERT OR IGNORE INTO cloud_sync_control (id) VALUES (1);
    UPDATE cloud_sync_control
    SET suppress_outbox = 0, lease_owner = NULL, lease_expires_at = NULL
    WHERE id = 1;

    CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_scope_generation
      ON cloud_sync_outbox(scope_id, generation);
    CREATE INDEX IF NOT EXISTS idx_cloud_sync_entities_scope_deleted
      ON cloud_sync_entities(scope_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_cloud_sync_blob_gc_eligible
      ON cloud_sync_blob_gc(scope_id, eligible_at);

    UPDATE playlists
    SET cloud_id = 'playlist-' || lower(hex(randomblob(16)))
    WHERE cloud_id IS NULL OR cloud_id = '';

    DROP TRIGGER IF EXISTS playlists_assign_cloud_id;
    CREATE TRIGGER playlists_assign_cloud_id
    AFTER INSERT ON playlists
    WHEN new.cloud_id IS NULL OR new.cloud_id = ''
    BEGIN
      UPDATE playlists
      SET cloud_id = 'playlist-' || lower(hex(randomblob(16)))
      WHERE id = new.id;
    END;
  `);
}
