import type { SQLiteDatabase } from 'expo-sqlite';

export async function createCloudAutoSyncTrackTriggers009(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
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
        scope_id, entity_type, entity_key, local_id, operation, payload_json, generation
      )
      SELECT '', 'track', 'hash:' || OLD.content_hash_sha256, NULL, 'delete',
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
    CREATE TRIGGER cloud_tracks_delete
    BEFORE DELETE ON tracks
    WHEN (SELECT suppress_outbox FROM cloud_sync_control WHERE id = 1) = 0
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1 WHERE id = 1;
      DELETE FROM cloud_sync_outbox
      WHERE scope_id = '' AND entity_type = 'track' AND entity_key = CAST(OLD.id AS TEXT);
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
  `);
}
