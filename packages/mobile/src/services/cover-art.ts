import * as FileSystem from 'expo-file-system';
import { selectCoverRepairCandidates } from './cloud-sync/cover-repair-candidates';
import { getDb } from './database';
import { buildLocalFileUri } from './library-transfer/file-helpers';

const ARTWORK_DIR = `${FileSystem.documentDirectory}artwork/`;
const COVER_BACKFILL_BATCH = 50;
const COVER_BACKFILL_PARALLEL = 4;

/** Songs already handled this session, so a cover that keeps failing is not retried on every sync. */
const coverBackfillAttempted = new Set<number>();
const coverRepublishAttempted = new Set<number>();

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
 * Covers missing on R2 are repaired before every sync (the desktop app does the same):
 * - A YouTube song saved without a cover (its cover download failed) gets the YouTube thumbnail.
 * - A song this phone has a cover for, but which R2 has without one, is queued again so the cover gets uploaded.
 * Both go through the outbox, so the next sync that publishes (upload or Auto Sync) uploads them.
 * Returns the ids of songs that got a new cover.
 */
export async function repairMissingCloudCovers(): Promise<number[]> {
  const { republish: unpublished, backfill: rows } = await selectCoverRepairCandidates(getDb());
  for (const row of unpublished.filter((candidate) => !coverRepublishAttempted.has(candidate.id))) {
    coverRepublishAttempted.add(row.id);
    if (!(await FileSystem.getInfoAsync(row.cover_art_path)).exists) continue;
    // Setting the same value fires the outbox trigger, which queues the song for upload with its cover.
    await getDb().runAsync('UPDATE tracks SET cover_art_path = cover_art_path WHERE id = ?', [row.id]);
  }

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
