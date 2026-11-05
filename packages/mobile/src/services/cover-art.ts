import * as FileSystem from 'expo-file-system';
import { getDb } from './database';
import { buildLocalFileUri } from './library-transfer/file-helpers';

const ARTWORK_DIR = `${FileSystem.documentDirectory}artwork/`;
const COVER_BACKFILL_BATCH = 50;
const COVER_BACKFILL_PARALLEL = 4;

/** Songs already handled this session, so a cover that keeps failing is not retried on every sync. */
const coverBackfillAttempted = new Set<number>();
const coverRepublishAttempted = new Set<number>();

/** The R2 record of the song in the active cloud library, as mirrored by the last sync. */
const PUBLISHED_TRACK_RECORD = `
  SELECT 1 FROM cloud_sync_entities entity
  WHERE entity.scope_id = (SELECT active_scope_id FROM cloud_sync_control WHERE id = 1)
    AND entity.entity_type = 'track'
    AND entity.entity_key = lower(tracks.content_hash_sha256)
    AND entity.deleted = 0`;

export async function ensureArtworkDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ARTWORK_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
  }
}

export async function downloadCoverArt(
  url: string,
  filename: string,
): Promise<string> {
  await ensureArtworkDir();
  const ext = url.includes('.png') ? '.png' : '.jpg';
  const destPath = buildLocalFileUri(ARTWORK_DIR, `${filename}${ext}`, 'cover');

  const info = await FileSystem.getInfoAsync(destPath);
  if (info.exists) return destPath;

  try {
    const result = await FileSystem.downloadAsync(url, destPath);
    if (result.status !== 200) throw new Error(`Cover art download failed: ${result.status}`);
  } catch (error) {
    // A failed or interrupted download must not leave a file that the exists-check above would reuse as a cover.
    await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
    throw error;
  }

  return destPath;
}

/** YouTube serves this size for every video, unlike the larger thumbnails search results sometimes point to. */
function youtubeFallbackThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/** Downloads a song's cover, falling back to the standard YouTube thumbnail when the given URL fails. */
export async function downloadTrackCoverArt(
  coverUrl: string | null,
  filename: string,
  youtubeId: string | null,
): Promise<string | null> {
  if (coverUrl) {
    try {
      return await downloadCoverArt(coverUrl, filename);
    } catch {
      // Falls back below.
    }
  }
  if (!youtubeId) return null;
  try {
    return await downloadCoverArt(youtubeFallbackThumbnailUrl(youtubeId), `${filename}-yt`);
  } catch {
    return null;
  }
}

/**
 * Covers missing on R2 are repaired before a sync publishes:
 * - A YouTube song saved without a cover (its cover download failed) gets the YouTube thumbnail. Songs whose R2 record
 *   has a cover are skipped: that cover is still being fetched from R2, and a thumbnail would replace it everywhere.
 * - A song this phone has a cover for, but which R2 has without one, is queued again so the cover gets uploaded.
 * Both go through the outbox, so the sync that follows publishes them. Returns the ids of songs that got a new cover.
 */
export async function repairMissingCloudCovers(): Promise<number[]> {
  const unpublished = await getDb().getAllAsync<{ id: number; cover_art_path: string }>(
    `SELECT id, cover_art_path FROM tracks
     WHERE in_library = 1 AND cover_art_path IS NOT NULL AND cover_art_path != ''
       AND EXISTS (${PUBLISHED_TRACK_RECORD}
         AND json_extract(entity.record_json, '$.entry.artwork_object_key') IS NULL)`,
  );
  for (const row of unpublished.filter((candidate) => !coverRepublishAttempted.has(candidate.id))) {
    coverRepublishAttempted.add(row.id);
    if (!(await FileSystem.getInfoAsync(row.cover_art_path)).exists) continue;
    // Setting the same value fires the outbox trigger, which queues the song for upload with its cover.
    await getDb().runAsync('UPDATE tracks SET cover_art_path = cover_art_path WHERE id = ?', [row.id]);
  }

  const rows = await getDb().getAllAsync<{ id: number; youtube_id: string }>(
    `SELECT id, youtube_id FROM tracks
     WHERE in_library = 1 AND (cover_art_path IS NULL OR cover_art_path = '')
       AND youtube_id IS NOT NULL AND youtube_id != ''
       AND NOT EXISTS (${PUBLISHED_TRACK_RECORD}
         AND json_extract(entity.record_json, '$.entry.artwork_object_key') IS NOT NULL)`,
  );
  const pending = rows.filter((row) => !coverBackfillAttempted.has(row.id)).slice(0, COVER_BACKFILL_BATCH);
  pending.forEach((row) => coverBackfillAttempted.add(row.id));
  const repaired: number[] = [];
  const worker = async () => {
    for (let row = pending.shift(); row; row = pending.shift()) {
      const coverPath = await downloadTrackCoverArt(null, `yt-${row.youtube_id}`, row.youtube_id);
      if (!coverPath) continue;
      const result = await getDb().runAsync(
        `UPDATE tracks SET cover_art_path = ?
         WHERE id = ? AND (cover_art_path IS NULL OR cover_art_path = '')`,
        [coverPath, row.id],
      );
      if (result.changes > 0) repaired.push(row.id);
    }
  };
  await Promise.all(Array.from({ length: COVER_BACKFILL_PARALLEL }, worker));
  return repaired;
}

export function getCoverArtUri(localPath: string): string {
  if (localPath.startsWith('file://')) return localPath;
  return `file://${localPath}`;
}
