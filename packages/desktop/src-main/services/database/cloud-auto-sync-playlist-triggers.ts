import type Database from 'better-sqlite3';

export function createCloudAutoSyncPlaylistTriggers(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS cloud_sync_playlist_insert;
    CREATE TRIGGER cloud_sync_playlist_insert
    AFTER INSERT ON playlists
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1
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
    AFTER UPDATE OF cloud_id, name, description, cover_path, is_smart, smart_rules,
      sort_order, updated_at
    ON playlists
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1
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
      UPDATE cloud_sync_control SET generation = generation + 1
      WHERE id = 1 AND suppress_outbox = 0;
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      )
      SELECT active_scope_id, 'playlist',
        CASE WHEN old.cloud_id IS NOT NULL AND old.cloud_id != ''
          THEN 'cloud:' || old.cloud_id ELSE CAST(old.id AS TEXT) END,
        old.id, 'delete', json_object('cloud_id', old.cloud_id), generation
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
      UPDATE cloud_sync_control SET generation = generation + 1
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
      UPDATE cloud_sync_control SET generation = generation + 1
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
      UPDATE cloud_sync_control SET generation = generation + 1
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
}
