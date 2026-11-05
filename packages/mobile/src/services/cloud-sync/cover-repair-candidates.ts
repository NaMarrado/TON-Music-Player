import type { SQLiteDatabase } from 'expo-sqlite';

/** The R2 record of the song in the active cloud library, as mirrored by the last sync. */
const PUBLISHED_TRACK_RECORD = `
  SELECT 1 FROM cloud_sync_entities entity
  WHERE entity.scope_id = (SELECT active_scope_id FROM cloud_sync_control WHERE id = 1)
    AND entity.entity_type = 'track'
    AND entity.entity_key = lower(tracks.content_hash_sha256)
    AND entity.deleted = 0`;

/**
 * Songs whose cover R2 lacks: `republish` has a local cover R2 does not (queue it again), `backfill` is a YouTube song
 * without any cover that R2 has no cover for either (fetch the YouTube thumbnail). Songs whose R2 record has a cover are
 * never backfilled: that cover is still being fetched from R2, and a thumbnail would replace it everywhere.
 */
export async function selectCoverRepairCandidates(db: Pick<SQLiteDatabase, 'getAllAsync'>): Promise<{
  republish: Array<{ id: number; cover_art_path: string }>;
  backfill: Array<{ id: number; youtube_id: string }>;
}> {
  const [republish, backfill] = await Promise.all([
    db.getAllAsync<{ id: number; cover_art_path: string }>(
      `SELECT id, cover_art_path FROM tracks
       WHERE in_library = 1 AND cover_art_path IS NOT NULL AND cover_art_path != ''
         AND EXISTS (${PUBLISHED_TRACK_RECORD}
           AND json_extract(entity.record_json, '$.entry.artwork_object_key') IS NULL)`,
    ),
    db.getAllAsync<{ id: number; youtube_id: string }>(
      `SELECT id, youtube_id FROM tracks
       WHERE in_library = 1 AND (cover_art_path IS NULL OR cover_art_path = '')
         AND youtube_id IS NOT NULL AND youtube_id != ''
         AND NOT EXISTS (${PUBLISHED_TRACK_RECORD}
           AND json_extract(entity.record_json, '$.entry.artwork_object_key') IS NOT NULL)`,
    ),
  ]);
  return { republish, backfill };
}
