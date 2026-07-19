import type { SQLiteDatabase } from 'expo-sqlite';

export async function createCloudAutoSyncTrackTriggers009(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DROP TRIGGER IF EXISTS cloud_tracks_insert;
    CREATE TRIGGER cloud_tracks_insert
    AFTER INSERT ON tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      DELETE FROM cloud_sync_local_exclusions
      WHERE scope_id = (SELECT active_scope_id FROM cloud_sync_control WHERE id = 1)
        AND content_hash_sha256 = lower(NEW.content_hash_sha256)
        AND NEW.content_hash_sha256 IS NOT NULL
        AND NEW.content_hash_sha256 != '';

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
      DELETE FROM cloud_sync_local_exclusions
      WHERE scope_id = (SELECT active_scope_id FROM cloud_sync_control WHERE id = 1)
        AND content_hash_sha256 = lower(NEW.content_hash_sha256)
        AND NEW.content_hash_sha256 IS NOT NULL
        AND NEW.content_hash_sha256 != '';

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
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT '', 'playlist', CAST(p.id AS TEXT), p.id, 'upsert',
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
    DROP TRIGGER IF EXISTS cloud_tracks_delete_end;
    CREATE TRIGGER cloud_tracks_delete
    BEFORE DELETE ON tracks
    BEGIN
      INSERT INTO cloud_sync_local_exclusions(
        scope_id, content_hash_sha256, deleted_at
      )
      SELECT active_scope_id, lower(OLD.content_hash_sha256), strftime('%s','now')
      FROM cloud_sync_control
      WHERE id = 1
        AND suppress_outbox = 0
        AND active_scope_id != ''
        AND OLD.content_hash_sha256 IS NOT NULL
        AND OLD.content_hash_sha256 != ''
      ON CONFLICT(scope_id, content_hash_sha256) DO UPDATE SET
        deleted_at = excluded.deleted_at;

      UPDATE cloud_sync_control
      SET suppress_outbox = suppress_outbox + 1
      WHERE id = 1;
    END;

    CREATE TRIGGER cloud_tracks_delete_end
    AFTER DELETE ON tracks
    BEGIN
      UPDATE cloud_sync_control
      SET suppress_outbox = MAX(0, suppress_outbox - 1)
      WHERE id = 1;
    END;

    DELETE FROM cloud_sync_outbox
    WHERE entity_type = 'track' AND operation = 'delete';
  `);
}
