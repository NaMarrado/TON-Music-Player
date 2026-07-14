import { getDb } from '../services/database';

export function getPlaylistLibraryStatus(playlistId: number) {
  const db = getDb();
  const playlistTracks = db
    .prepare(`
      SELECT t.id
      FROM tracks t
      JOIN playlist_tracks pt ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
    `)
    .all(playlistId) as Array<{ id: number }>;

  return {
    total: playlistTracks.length,
    alreadyInLibrary: playlistTracks.length,
    newTracks: 0,
  };
}

export async function addPlaylistTracksToLibrary(playlistId: number, _forceAll = false) {
  const db = getDb();
  const tracks = db
    .prepare(`
      SELECT t.id
      FROM tracks t
      JOIN playlist_tracks pt ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
    `)
    .all(playlistId) as Array<{ id: number }>;
  db.prepare(`
    UPDATE tracks
    SET in_library = 1
    WHERE id IN (
      SELECT track_id FROM playlist_tracks WHERE playlist_id = ?
    )
  `).run(playlistId);
  return { added: 0, skipped: tracks.length };
}
