import fs from 'fs';
import { getDb } from '../../services/database';
import type { LibraryDeleteMode, LibraryDeleteTracksResult } from './types';

async function deleteFilesBestEffort(paths: Array<string | null | undefined>): Promise<void> {
  const uniquePaths = Array.from(
    new Set(paths.filter((path): path is string => Boolean(path))),
  );

  await Promise.all(
    uniquePaths.map((filePath) => fs.promises.unlink(filePath).catch(() => {})),
  );
}

export async function handleLibraryDeleteTracks(
  trackIds: number[],
  _mode: LibraryDeleteMode = 'everywhere',
): Promise<LibraryDeleteTracksResult> {
  const uniqueTrackIds = Array.from(new Set(trackIds));
  if (uniqueTrackIds.length === 0) {
    return { deleted: 0 };
  }

  const db = getDb();
  const placeholders = uniqueTrackIds.map(() => '?').join(',');
  const tracks = db
    .prepare(`SELECT id, file_path, cover_art_path FROM tracks WHERE id IN (${placeholders})`)
    .all(...uniqueTrackIds) as Array<{ id: number; file_path: string; cover_art_path: string | null }>;

  const playlistCopies = db.prepare(
    `SELECT file_path FROM playlist_tracks WHERE track_id IN (${placeholders}) AND file_path IS NOT NULL`,
  ).all(...uniqueTrackIds) as Array<{ file_path: string | null }>;

  db.prepare(`DELETE FROM tracks WHERE id IN (${placeholders})`).run(...uniqueTrackIds);
  await deleteFilesBestEffort([
    ...tracks.flatMap((track) => [track.file_path, track.cover_art_path]),
    ...playlistCopies.map((track) => track.file_path),
  ]);

  return { deleted: uniqueTrackIds.length };
}
