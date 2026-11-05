import * as FileSystem from 'expo-file-system';
import { getDb } from './database';
import { buildLocalFileUri } from './library-transfer/file-helpers';

const ARTWORK_DIR = `${FileSystem.documentDirectory}artwork/`;
const COVER_BACKFILL_BATCH = 50;

/** Songs already retried this session, so a thumbnail that keeps failing is not fetched on every sync. */
const coverBackfillAttempted = new Set<number>();

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

  const result = await FileSystem.downloadAsync(url, destPath);
  if (result.status !== 200) {
    await FileSystem.deleteAsync(destPath, { idempotent: true });
    throw new Error(`Cover art download failed: ${result.status}`);
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
 * Gives YouTube songs that were saved without a cover (their cover download failed) another try. Setting the cover
 * queues the song for the next cloud sync, so the cover also reaches R2 and the other devices.
 * Returns the ids of songs that got a cover.
 */
export async function backfillMissingYoutubeCovers(): Promise<number[]> {
  const rows = await getDb().getAllAsync<{ id: number; youtube_id: string }>(
    `SELECT id, youtube_id FROM tracks
     WHERE in_library = 1 AND (cover_art_path IS NULL OR cover_art_path = '')
       AND youtube_id IS NOT NULL AND youtube_id != ''`,
  );
  const repaired: number[] = [];
  for (const row of rows.filter((candidate) => !coverBackfillAttempted.has(candidate.id)).slice(0, COVER_BACKFILL_BATCH)) {
    coverBackfillAttempted.add(row.id);
    const coverPath = await downloadTrackCoverArt(null, `yt-${row.youtube_id}`, row.youtube_id);
    if (!coverPath) continue;
    const result = await getDb().runAsync(
      `UPDATE tracks SET cover_art_path = ?
       WHERE id = ? AND (cover_art_path IS NULL OR cover_art_path = '')`,
      [coverPath, row.id],
    );
    if (result.changes > 0) repaired.push(row.id);
  }
  return repaired;
}

export function getCoverArtUri(localPath: string): string {
  if (localPath.startsWith('file://')) return localPath;
  return `file://${localPath}`;
}
