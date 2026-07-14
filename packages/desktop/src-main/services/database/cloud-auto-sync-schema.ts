import type Database from 'better-sqlite3';

/**
 * Durable bookkeeping for incremental cloud sync.
 *
 * The triggers deliberately enqueue local numeric IDs instead of serializing a
 * cloud record. The coordinator resolves the latest row immediately before a
 * run, so a burst of edits collapses into one authoritative upsert. Delete
 * triggers retain the cloud identity in payload_json because the source row no
 * longer exists when the outbox is drained.
 */
export function createCloudAutoSyncSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cloud_sync_state (
      scope_id              TEXT PRIMARY KEY,
      revision              TEXT,
      etag                  TEXT,
      lamport_counter       INTEGER NOT NULL DEFAULT 0,
      last_success_at       INTEGER,
      last_error            TEXT,
      next_retry_at         INTEGER,
      needs_full_reconcile  INTEGER NOT NULL DEFAULT 1,
      pending_remote_revision TEXT,
      pending_downloads     INTEGER NOT NULL DEFAULT 0,
      last_commit_cleanup_at INTEGER,
      activation_marker_confirmed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_entities (
      scope_id          TEXT NOT NULL,
      entity_type       TEXT NOT NULL CHECK (entity_type IN ('track', 'playlist')),
      entity_key        TEXT NOT NULL,
      record_json       TEXT NOT NULL,
      version_counter   INTEGER NOT NULL DEFAULT 0,
      version_device_id TEXT NOT NULL DEFAULT '',
      is_deleted        INTEGER NOT NULL DEFAULT 0,
      updated_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, entity_type, entity_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
      id            INTEGER PRIMARY KEY,
      scope_id      TEXT NOT NULL DEFAULT '',
      entity_type   TEXT NOT NULL CHECK (entity_type IN ('track', 'playlist', 'library')),
      entity_key    TEXT NOT NULL,
      local_id      INTEGER,
      operation     TEXT NOT NULL CHECK (operation IN ('upsert', 'delete', 'reconcile')),
      payload_json  TEXT,
      generation    INTEGER NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE (scope_id, entity_type, entity_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_control (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      active_scope_id   TEXT NOT NULL DEFAULT '',
      generation        INTEGER NOT NULL DEFAULT 0,
      suppress_outbox   INTEGER NOT NULL DEFAULT 0,
      lease_owner       TEXT,
      lease_expires_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_blob_gc (
      scope_id      TEXT NOT NULL,
      object_key    TEXT NOT NULL,
      eligible_at   INTEGER NOT NULL,
      PRIMARY KEY (scope_id, object_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_hash_cache (
      file_path   TEXT PRIMARY KEY,
      file_size   INTEGER NOT NULL,
      file_mtime  INTEGER NOT NULL,
      sha256      TEXT NOT NULL,
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
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

    DROP TRIGGER IF EXISTS cloud_sync_track_insert;
    CREATE TRIGGER cloud_sync_track_insert
    AFTER INSERT ON tracks
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'track', CAST(new.id AS TEXT), new.id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = 'upsert',
        payload_json = NULL,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_track_update;
    CREATE TRIGGER cloud_sync_track_update
    AFTER UPDATE OF
      content_hash_sha256, file_size, title, artist, album, album_artist,
      track_number, disc_number, duration_ms, genre, year, bitrate, sample_rate,
      format, cover_art_path, loudness_lufs, loudness_gain, youtube_id,
      spotify_id, soundcloud_id, source_url, rating, downloaded_at
    ON tracks
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'track', CAST(new.id AS TEXT), new.id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = 'upsert',
        payload_json = NULL,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, operation, payload_json, generation
      )
      SELECT active_scope_id, 'track', 'hash:' || old.content_hash_sha256,
        'delete', json_object('content_hash_sha256', old.content_hash_sha256), generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
        AND old.content_hash_sha256 IS NOT NULL
        AND old.content_hash_sha256 != ''
        AND old.content_hash_sha256 IS NOT new.content_hash_sha256
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = 'delete',
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT control.active_scope_id, 'playlist', CAST(membership.playlist_id AS TEXT),
        membership.playlist_id, 'upsert', control.generation
      FROM cloud_sync_control AS control
      JOIN (
        SELECT DISTINCT playlist_id
        FROM playlist_tracks
        WHERE track_id = new.id
      ) AS membership
      WHERE control.id = 1 AND control.suppress_outbox = 0
        AND old.content_hash_sha256 IS NOT new.content_hash_sha256
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN 'delete' ELSE excluded.operation END,
        payload_json = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN cloud_sync_outbox.payload_json ELSE NULL END,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_track_delete;
    CREATE TRIGGER cloud_sync_track_delete
    BEFORE DELETE ON tracks
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      )
      SELECT active_scope_id, 'track',
        CASE
          WHEN old.content_hash_sha256 IS NOT NULL AND old.content_hash_sha256 != ''
            THEN 'hash:' || old.content_hash_sha256
          ELSE CAST(old.id AS TEXT)
        END,
        old.id, 'delete',
        json_object('content_hash_sha256', old.content_hash_sha256), generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = 'delete',
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_playlist_insert;
    CREATE TRIGGER cloud_sync_playlist_insert
    AFTER INSERT ON playlists
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'playlist', CAST(new.id AS TEXT), new.id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = 'upsert',
        payload_json = NULL,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_playlist_update;
    CREATE TRIGGER cloud_sync_playlist_update
    AFTER UPDATE OF
      cloud_id, name, description, cover_path, is_smart, smart_rules,
      sort_order, updated_at
    ON playlists
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'playlist', CAST(new.id AS TEXT), new.id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = 'upsert',
        payload_json = NULL,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, operation, payload_json, generation
      )
      SELECT active_scope_id, 'playlist', 'cloud:' || old.cloud_id,
        'delete', json_object('cloud_id', old.cloud_id), generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
        AND old.cloud_id IS NOT NULL AND old.cloud_id != ''
        AND old.cloud_id IS NOT new.cloud_id
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = 'delete',
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_playlist_delete;
    CREATE TRIGGER cloud_sync_playlist_delete
    BEFORE DELETE ON playlists
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      )
      SELECT active_scope_id, 'playlist',
        CASE
          WHEN old.cloud_id IS NOT NULL AND old.cloud_id != ''
            THEN 'cloud:' || old.cloud_id
          ELSE CAST(old.id AS TEXT)
        END,
        old.id, 'delete',
        json_object('cloud_id', old.cloud_id), generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = 'delete',
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_playlist_track_insert;
    CREATE TRIGGER cloud_sync_playlist_track_insert
    AFTER INSERT ON playlist_tracks
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'playlist', CAST(new.playlist_id AS TEXT),
        new.playlist_id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN 'delete' ELSE excluded.operation END,
        payload_json = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN cloud_sync_outbox.payload_json ELSE NULL END,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_playlist_track_update;
    CREATE TRIGGER cloud_sync_playlist_track_update
    AFTER UPDATE OF playlist_id, track_id, position ON playlist_tracks
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'playlist', CAST(new.playlist_id AS TEXT),
        new.playlist_id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN 'delete' ELSE excluded.operation END,
        payload_json = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN cloud_sync_outbox.payload_json ELSE NULL END,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'playlist', CAST(old.playlist_id AS TEXT),
        old.playlist_id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0 AND old.playlist_id != new.playlist_id
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN 'delete' ELSE excluded.operation END,
        payload_json = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN cloud_sync_outbox.payload_json ELSE NULL END,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_sync_playlist_track_delete;
    CREATE TRIGGER cloud_sync_playlist_track_delete
    AFTER DELETE ON playlist_tracks
    BEGIN
      UPDATE cloud_sync_control
      SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0
        AND EXISTS (SELECT 1 FROM playlists WHERE id = old.playlist_id);
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT active_scope_id, 'playlist', CAST(old.playlist_id AS TEXT),
        old.playlist_id, 'upsert', generation
      FROM cloud_sync_control
      WHERE id = 1 AND suppress_outbox = 0
        AND EXISTS (SELECT 1 FROM playlists WHERE id = old.playlist_id)
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN 'delete' ELSE excluded.operation END,
        payload_json = CASE WHEN cloud_sync_outbox.operation = 'delete'
          THEN cloud_sync_outbox.payload_json ELSE NULL END,
        generation = excluded.generation,
        updated_at = strftime('%s','now');
    END;
  `);

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
