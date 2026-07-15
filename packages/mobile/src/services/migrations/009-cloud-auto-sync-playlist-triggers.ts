import type { SQLiteDatabase } from 'expo-sqlite';

export async function createCloudAutoSyncPlaylistTriggers009(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
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
        local_id = excluded.local_id, operation = excluded.operation,
        payload_json = NULL, generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlists_update;
    CREATE TRIGGER cloud_playlists_update
    AFTER UPDATE OF cloud_id, name, description, cover_path, is_smart, smart_rules,
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
        local_id = excluded.local_id, operation = excluded.operation,
        payload_json = NULL, generation = excluded.generation,
        created_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      )
      SELECT '', 'playlist', 'cloud:' || OLD.cloud_id, NULL, 'delete',
        json_object('cloud_id', OLD.cloud_id, 'name', OLD.name),
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      WHERE OLD.cloud_id IS NOT NULL AND OLD.cloud_id != ''
        AND OLD.cloud_id IS NOT NEW.cloud_id
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = NULL, operation = excluded.operation,
        payload_json = excluded.payload_json, generation = excluded.generation,
        created_at = strftime('%s','now');
    END;

    DROP TRIGGER IF EXISTS cloud_playlists_delete;
    CREATE TRIGGER cloud_playlists_delete
    BEFORE DELETE ON playlists
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      DELETE FROM cloud_sync_outbox
      WHERE scope_id = '' AND entity_type = 'playlist' AND entity_key = CAST(OLD.id AS TEXT);
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      ) VALUES (
        '', 'playlist',
        CASE WHEN OLD.cloud_id IS NOT NULL AND OLD.cloud_id != ''
          THEN 'cloud:' || OLD.cloud_id ELSE CAST(OLD.id AS TEXT) END,
        OLD.id, 'delete', json_object('cloud_id', OLD.cloud_id, 'name', OLD.name),
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      )
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        local_id = excluded.local_id, operation = excluded.operation,
        payload_json = excluded.payload_json, generation = excluded.generation,
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
        operation = excluded.operation, generation = excluded.generation,
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
        operation = excluded.operation, generation = excluded.generation,
        created_at = strftime('%s','now');
      INSERT INTO cloud_sync_outbox(
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT '', 'playlist', CAST(OLD.playlist_id AS TEXT), OLD.playlist_id, 'upsert',
        (SELECT generation FROM cloud_sync_control WHERE id = 1)
      WHERE OLD.playlist_id != NEW.playlist_id
      ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
        operation = excluded.operation, generation = excluded.generation,
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
        operation = excluded.operation, generation = excluded.generation,
        created_at = strftime('%s','now');
    END;
  `);
}
