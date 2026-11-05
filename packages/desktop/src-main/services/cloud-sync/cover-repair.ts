import fs from 'node:fs';
import { getDb } from '../database';
import { downloadCoverArt, youtubeFallbackThumbnailUrl } from '../downloader/artwork';

const COVER_BACKFILL_BATCH = 50;
const COVER_BACKFILL_PARALLEL = 4;

/** Songs already handled this session, so a cover that keeps failing is not retried on every sync. */
const coverBackfillAttempted = new Set<number>();
const coverRepublishAttempted = new Set<number>();

/** The R2 record of the song in the cloud library being synced, as mirrored by the last sync. */
const PUBLISHED_TRACK_RECORD = `
  SELECT 1 FROM cloud_sync_entities entity
  WHERE entity.scope_id = ?
    AND entity.entity_type = 'track'
    AND entity.entity_key = lower(tracks.content_hash_sha256)
    AND entity.is_deleted = 0`;

/**
 * Covers missing on R2 are repaired before a sync publishes (the phone app does the same):
 * - A YouTube song without a cover gets the YouTube thumbnail. Songs whose R2 record has a cover are skipped: that
 *   cover is still being fetched from R2, and a thumbnail would replace it everywhere.
 * - A song this computer has a cover for, but which R2 has without one, is queued again so the cover gets uploaded.
 * Both go through the outbox, so the sync that follows publishes them. Returns the ids of songs that got a new cover.
 */
export async function repairMissingCloudCovers(scopeId: string): Promise<number[]> {
  const db = getDb();
  const unpublished = db.prepare(
    `SELECT id, cover_art_path FROM tracks
     WHERE in_library = 1 AND cover_art_path IS NOT NULL AND cover_art_path != ''
       AND EXISTS (${PUBLISHED_TRACK_RECORD}
         AND json_extract(entity.record_json, '$.entry.artwork_object_key') IS NULL)`,
  ).all(scopeId) as Array<{ id: number; cover_art_path: string }>;
  const requeue = db.prepare('UPDATE tracks SET cover_art_path = cover_art_path WHERE id = ?');
  for (const row of unpublished) {
    if (coverRepublishAttempted.has(row.id)) continue;
    coverRepublishAttempted.add(row.id);
    // Setting the same value fires the outbox trigger, which queues the song for upload with its cover.
    if (fs.existsSync(row.cover_art_path)) requeue.run(row.id);
  }

  const pending = (db.prepare(
    `SELECT id, youtube_id FROM tracks
     WHERE in_library = 1 AND (cover_art_path IS NULL OR cover_art_path = '')
       AND youtube_id IS NOT NULL AND youtube_id != ''
       AND NOT EXISTS (${PUBLISHED_TRACK_RECORD}
         AND json_extract(entity.record_json, '$.entry.artwork_object_key') IS NOT NULL)`,
  ).all(scopeId) as Array<{ id: number; youtube_id: string }>)
    .filter((row) => !coverBackfillAttempted.has(row.id))
    .slice(0, COVER_BACKFILL_BATCH);
  pending.forEach((row) => coverBackfillAttempted.add(row.id));
  const setCover = db.prepare(
    `UPDATE tracks SET cover_art_path = ?
     WHERE id = ? AND (cover_art_path IS NULL OR cover_art_path = '')`,
  );
  const repaired: number[] = [];
  const worker = async () => {
    for (let row = pending.shift(); row; row = pending.shift()) {
      const coverPath = await downloadCoverArt(youtubeFallbackThumbnailUrl(row.youtube_id), `yt-${row.youtube_id}`);
      if (coverPath && setCover.run(coverPath, row.id).changes > 0) repaired.push(row.id);
    }
  };
  await Promise.all(Array.from({ length: COVER_BACKFILL_PARALLEL }, worker));
  return repaired;
}
