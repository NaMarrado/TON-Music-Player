import fs from 'node:fs';
import { getDb } from '../database';
import { downloadCoverArt, youtubeFallbackThumbnailUrl } from '../downloader/artwork';
import { selectCoverRepairCandidates } from './cover-repair-candidates';

const COVER_BACKFILL_BATCH = 50;
const COVER_BACKFILL_PARALLEL = 4;

/** Songs already handled this session, so a cover that keeps failing is not retried on every sync. */
const coverBackfillAttempted = new Set<number>();
const coverRepublishAttempted = new Set<number>();

/**
 * Covers missing on R2 are repaired before every sync (the phone app does the same). Both kinds go through the outbox,
 * so the next sync that publishes (upload or Auto Sync) uploads them. Returns the ids of songs that got a new cover.
 */
export async function repairMissingCloudCovers(scopeId: string): Promise<number[]> {
  const db = getDb();
  const candidates = selectCoverRepairCandidates(db, scopeId);
  const unpublished = candidates.republish;
  const requeue = db.prepare('UPDATE tracks SET cover_art_path = cover_art_path WHERE id = ?');
  for (const row of unpublished) {
    if (coverRepublishAttempted.has(row.id)) continue;
    coverRepublishAttempted.add(row.id);
    // Setting the same value fires the outbox trigger, which queues the song for upload with its cover.
    if (fs.existsSync(row.cover_art_path)) requeue.run(row.id);
  }

  const pending = candidates.backfill
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
