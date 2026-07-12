import fs from 'fs';
import { getPlaylistDir } from '../../../services/library-paths';
import { getDb } from '../../../services/database';

export function touchPlaylist(playlistId: number): void {
  getDb().prepare("UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?").run(playlistId);
}

export async function cleanupOrphanedTrack(trackId: number): Promise<void> {
  const db = getDb();
  const refs = db.prepare(
    'SELECT COUNT(*) as c FROM playlist_tracks WHERE track_id = ?',
  ).get(trackId) as { c: number };
  const track = db.prepare(
    'SELECT in_library, file_path, cover_art_path FROM tracks WHERE id = ?',
  ).get(trackId) as {
    in_library: number;
    file_path: string;
    cover_art_path: string | null;
  } | undefined;

  if (track && !track.in_library && refs.c === 0) {
    db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);
    await Promise.all(
      [track.file_path, track.cover_art_path]
        .filter((filePath): filePath is string => Boolean(filePath))
        .map((filePath) => fs.promises.unlink(filePath).catch(() => {})),
    );
  }
}

export async function cleanupPlaylistFiles(
  playlistId: number,
  filePaths: Array<string | null>,
): Promise<void> {
  await Promise.all(
    filePaths.map(async (filePath) => {
      if (!filePath) {
        return;
      }

      await fs.promises.unlink(filePath).catch(() => {});
    }),
  );

  await fs.promises.rm(getPlaylistDir(playlistId), { recursive: true, force: true }).catch(() => {});
}
