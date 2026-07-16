import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * iOS sandbox path rewrites used to enqueue every affected track as a cloud
 * mutation. Remove only rows whose complete syncable payload still matches
 * the authoritative entity mirror, including the cached artwork hash.
 */
export async function migrate015(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    DELETE FROM cloud_sync_outbox
    WHERE entity_type = 'track'
      AND operation = 'upsert'
      AND local_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM tracks track
        JOIN cloud_sync_entities entity
          ON entity.scope_id = cloud_sync_outbox.scope_id
         AND entity.entity_type = 'track'
         AND entity.entity_key = track.content_hash_sha256
         AND entity.deleted = 0
        WHERE track.id = cloud_sync_outbox.local_id
          AND track.title IS json_extract(entity.record_json, '$.entry.metadata.title')
          AND track.artist IS json_extract(entity.record_json, '$.entry.metadata.artist')
          AND track.album IS json_extract(entity.record_json, '$.entry.metadata.album')
          AND track.album_artist IS json_extract(entity.record_json, '$.entry.metadata.album_artist')
          AND track.track_number IS json_extract(entity.record_json, '$.entry.metadata.track_number')
          AND track.disc_number IS json_extract(entity.record_json, '$.entry.metadata.disc_number')
          AND track.duration_ms IS json_extract(entity.record_json, '$.entry.metadata.duration_ms')
          AND track.genre IS json_extract(entity.record_json, '$.entry.metadata.genre')
          AND track.year IS json_extract(entity.record_json, '$.entry.metadata.year')
          AND track.bitrate IS json_extract(entity.record_json, '$.entry.metadata.bitrate')
          AND track.sample_rate IS json_extract(entity.record_json, '$.entry.metadata.sample_rate')
          AND track.file_size IS json_extract(entity.record_json, '$.entry.file_size')
          AND track.format IS json_extract(entity.record_json, '$.entry.format')
          AND track.loudness_lufs IS json_extract(entity.record_json, '$.entry.metadata.loudness_lufs')
          AND track.loudness_gain IS json_extract(entity.record_json, '$.entry.metadata.loudness_gain')
          AND track.youtube_id IS json_extract(entity.record_json, '$.entry.youtube_id')
          AND track.spotify_id IS json_extract(entity.record_json, '$.entry.spotify_id')
          AND track.soundcloud_id IS json_extract(entity.record_json, '$.entry.soundcloud_id')
          AND track.source_url IS json_extract(entity.record_json, '$.entry.source_url')
          AND track.rating IS json_extract(entity.record_json, '$.entry.metadata.rating')
          AND track.downloaded_at IS json_extract(entity.record_json, '$.entry.downloaded_at')
          AND (
            (track.cover_art_path IS NULL
              AND json_extract(entity.record_json, '$.entry.artwork_hash_sha256') IS NULL)
            OR EXISTS (
              SELECT 1 FROM cloud_sync_hash_cache cache
              WHERE cache.file_path = track.cover_art_path
                AND cache.sha256 = json_extract(
                  entity.record_json, '$.entry.artwork_hash_sha256'
                )
            )
          )
      );
  `);
}
