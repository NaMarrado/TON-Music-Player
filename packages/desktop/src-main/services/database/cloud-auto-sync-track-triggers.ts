import type Database from 'better-sqlite3';

export function createCloudAutoSyncTrackTriggers(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS cloud_sync_track_insert;
    CREATE TRIGGER cloud_sync_track_insert
    AFTER INSERT ON tracks
    BEGIN
      UPDATE cloud_sync_control SET generation = generation + 1
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
      UPDATE cloud_sync_control SET generation = generation + 1
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
        scope_id, entity_type, entity_key, local_id, operation, generation
      )
      SELECT control.active_scope_id, 'playlist', CAST(membership.playlist_id AS TEXT),
        membership.playlist_id, 'upsert', control.generation
      FROM cloud_sync_control AS control
      JOIN (
        SELECT DISTINCT playlist_id FROM playlist_tracks WHERE track_id = new.id
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
    DROP TRIGGER IF EXISTS cloud_sync_track_delete_end;
    CREATE TRIGGER cloud_sync_track_delete
    BEFORE DELETE ON tracks
    BEGIN
      UPDATE cloud_sync_control
      SET suppress_outbox = suppress_outbox + 1
      WHERE id = 1;
    END;

    CREATE TRIGGER cloud_sync_track_delete_end
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
