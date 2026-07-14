import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Durable journal used by both the foreground and the OS-scheduled cloud sync
 * runtimes. Triggers deliberately write into the unscoped (empty scope_id)
 * journal: the runtime adopts those rows into the currently configured R2
 * scope before it starts a sync. This means changing credentials cannot lose a
 * local edit that happened while no valid cloud configuration was available.
 */
export async function migrate009(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cloud_sync_state (
      scope_id             TEXT PRIMARY KEY,
      revision             TEXT,
      etag                 TEXT,
      lamport_counter      INTEGER NOT NULL DEFAULT 0,
      last_success_at      INTEGER,
      last_error           TEXT,
      next_retry_at        INTEGER,
      last_cleanup_at      INTEGER,
      needs_full_reconcile INTEGER NOT NULL DEFAULT 1,
      pending_downloads    INTEGER NOT NULL DEFAULT 0,
      pending_assets       INTEGER NOT NULL DEFAULT 0,
      activation_marker_confirmed INTEGER NOT NULL DEFAULT 0,
      updated_at           INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_entities (
      scope_id          TEXT NOT NULL,
      entity_type       TEXT NOT NULL CHECK(entity_type IN ('track', 'playlist')),
      entity_key        TEXT NOT NULL,
      version_counter   INTEGER NOT NULL,
      version_device_id TEXT NOT NULL,
      record_json       TEXT NOT NULL,
      deleted           INTEGER NOT NULL DEFAULT 0,
      updated_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, entity_type, entity_key)
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_outbox (
      scope_id    TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL CHECK(entity_type IN ('track', 'playlist')),
      entity_key  TEXT NOT NULL,
      local_id    INTEGER,
      operation   TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
      payload_json TEXT,
      generation  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (scope_id, entity_type, entity_key)
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_sync_outbox_generation
      ON cloud_sync_outbox(scope_id, generation);

    CREATE TABLE IF NOT EXISTS cloud_sync_blob_gc (
      scope_id   TEXT NOT NULL,
      object_key TEXT NOT NULL,
      eligible_at INTEGER NOT NULL,
      PRIMARY KEY (scope_id, object_key)
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_sync_blob_gc_eligible
      ON cloud_sync_blob_gc(scope_id, eligible_at);

    CREATE TABLE IF NOT EXISTS cloud_sync_hash_cache (
      file_path  TEXT PRIMARY KEY,
      file_size  INTEGER NOT NULL,
      file_mtime REAL NOT NULL,
      sha256     TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS cloud_sync_control (
      id              INTEGER PRIMARY KEY CHECK(id = 1),
      generation      INTEGER NOT NULL DEFAULT 0,
      suppress_outbox INTEGER NOT NULL DEFAULT 0,
      lease_owner     TEXT,
      lease_expires_at INTEGER
    );

    INSERT OR IGNORE INTO cloud_sync_control(id) VALUES (1);

    UPDATE playlists
    SET cloud_id = 'playlist-' || lower(hex(randomblob(16)))
    WHERE cloud_id IS NULL OR cloud_id = '';

    DROP TRIGGER IF EXISTS playlists_cloud_id_insert;
    CREATE TRIGGER playlists_cloud_id_insert
    AFTER INSERT ON playlists
    WHEN NEW.cloud_id IS NULL OR NEW.cloud_id = ''
    BEGIN
      UPDATE playlists
      SET cloud_id = 'playlist-' || lower(hex(randomblob(16)))
      WHERE id = NEW.id;
    END;

    DROP TRIGGER IF EXISTS cloud_tracks_insert;
    CREATE TRIGGER cloud_tracks_insert
    AFTER INSERT ON tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      ) VALUES (
        '', 'track', CAST(NEW.id AS TEXT), NEW.id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = excluded.operation,
        payload_json = NULL,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_tracks_update;
    CREATE TRIGGER cloud_tracks_update
    AFTER UPDATE OF
      content_hash_sha256, file_size, title, artist, album, album_artist,
      track_number, disc_number, duration_ms, genre, year, bitrate,
      sample_rate, format, cover_art_path, loudness_lufs, loudness_gain,
      youtube_id, spotify_id, soundcloud_id, source_url, rating, downloaded_at
    ON tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      ) VALUES (
        '', 'track', CAST(NEW.id AS TEXT), NEW.id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = excluded.operation,
        payload_json = NULL,
        generation = excluded.generation,
        created_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, payload_json,
        generation
      )
      SELECT
        '', 'track', 'hash:' || OLD.content_hash_sha256, NULL, 'delete',
        json_object(
          'content_hash_sha256', OLD.content_hash_sha256,
          'file_path', OLD.file_path,
          'cover_art_path', OLD.cover_art_path
        ),
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      WHERE OLD.content_hash_sha256 IS NOT NULL
        AND OLD.content_hash_sha256 != ''
        AND OLD.content_hash_sha256 IS NOT NEW.content_hash_sha256
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = NULL,
        operation = excluded.operation,
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        created_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT
        '', 'playlist', CAST(p.id AS TEXT), p.id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      FROM playlists p
      JOIN playlist_tracks pt ON pt.playlist_id = p.id
      WHERE pt.track_id = NEW.id
        AND OLD.content_hash_sha256 IS NOT NEW.content_hash_sha256
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = excluded.operation,
        payload_json = NULL,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_tracks_delete;
    CREATE TRIGGER cloud_tracks_delete
    BEFORE DELETE ON tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      DELETE FROM cloud_sync_outbox
      WHERE scope_id = '' AND entity_type = 'track'
        AND entity_key = CAST(OLD.id AS TEXT);
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      ) VALUES (
        '', 'track',
        CASE WHEN OLD.content_hash_sha256 IS NOT NULL AND OLD.content_hash_sha256 != ''
          THEN 'hash:' || OLD.content_hash_sha256 ELSE CAST(OLD.id AS TEXT) END,
        OLD.id, 'delete',
        json_object(
          'content_hash_sha256', OLD.content_hash_sha256,
          'file_path', OLD.file_path,
          'cover_art_path', OLD.cover_art_path
        ),
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = excluded.operation,
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlists_insert;
    CREATE TRIGGER cloud_playlists_insert
    AFTER INSERT ON playlists
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      ) VALUES (
        '', 'playlist', CAST(NEW.id AS TEXT), NEW.id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = excluded.operation,
        payload_json = NULL,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlists_update;
    CREATE TRIGGER cloud_playlists_update
    AFTER UPDATE OF
      cloud_id, name, description, cover_path, is_smart, smart_rules,
      sort_order, updated_at
    ON playlists
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      ) VALUES (
        '', 'playlist', CAST(NEW.id AS TEXT), NEW.id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = excluded.operation,
        payload_json = NULL,
        generation = excluded.generation,
        created_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, payload_json,
        generation
      )
      SELECT
        '', 'playlist', 'cloud:' || OLD.cloud_id, NULL, 'delete',
        json_object('cloud_id', OLD.cloud_id, 'name', OLD.name),
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      WHERE OLD.cloud_id IS NOT NULL
        AND OLD.cloud_id != ''
        AND OLD.cloud_id IS NOT NEW.cloud_id
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = NULL,
        operation = excluded.operation,
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlists_delete;
    CREATE TRIGGER cloud_playlists_delete
    BEFORE DELETE ON playlists
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      DELETE FROM cloud_sync_outbox
      WHERE scope_id = '' AND entity_type = 'playlist'
        AND entity_key = CAST(OLD.id AS TEXT);
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      ) VALUES (
        '', 'playlist',
        CASE WHEN OLD.cloud_id IS NOT NULL AND OLD.cloud_id != ''
          THEN 'cloud:' || OLD.cloud_id ELSE CAST(OLD.id AS TEXT) END,
        OLD.id, 'delete',
        json_object('cloud_id', OLD.cloud_id, 'name', OLD.name),
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id,
        operation = excluded.operation,
        payload_json = excluded.payload_json,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlist_tracks_insert;
    CREATE TRIGGER cloud_playlist_tracks_insert
    AFTER INSERT ON playlist_tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      ) VALUES (
        '', 'playlist', CAST(NEW.playlist_id AS TEXT), NEW.playlist_id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = excluded.operation,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlist_tracks_update;
    CREATE TRIGGER cloud_playlist_tracks_update
    AFTER UPDATE OF playlist_id, track_id, position ON playlist_tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      ) VALUES (
        '', 'playlist', CAST(NEW.playlist_id AS TEXT), NEW.playlist_id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = excluded.operation,
        generation = excluded.generation,
        created_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT
        '', 'playlist', CAST(OLD.playlist_id AS TEXT), OLD.playlist_id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      WHERE OLD.playlist_id != NEW.playlist_id
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = excluded.operation,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlist_tracks_delete;
    CREATE TRIGGER cloud_playlist_tracks_delete
    AFTER DELETE ON playlist_tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
      AND EXISTS(SELECT 1 FROM playlists WHERE id = OLD.playlist_id)
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      ) VALUES (
        '', 'playlist', CAST(OLD.playlist_id AS TEXT), OLD.playlist_id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = excluded.operation,
        generation = excluded.generation,
        created_at = strftime('%s','now');
    END;
  `);
}
