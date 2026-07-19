import type Database from 'better-sqlite3';
import type {
  PlaylistAddTracksRequest,
  PlaylistAddTracksResult,
  PlaylistDuplicateTrack,
} from '@ton/core';

export function addTracksToPlaylistAtomic(
  db: Database.Database,
  request: PlaylistAddTracksRequest,
): PlaylistAddTracksResult {
  const trackIds = [...new Set(request.trackIds)];
  if (trackIds.length === 0) return { status: 'added', addedCount: 0 };

  return db.transaction((): PlaylistAddTracksResult => {
    const placeholders = trackIds.map(() => '?').join(',');
    const duplicateRows = db.prepare(
      `SELECT DISTINCT t.id AS trackId, t.title, t.artist
       FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? AND pt.track_id IN (${placeholders})`,
    ).all(request.playlistId, ...trackIds) as PlaylistDuplicateTrack[];
    const duplicatesById = new Map(duplicateRows.map((track) => [track.trackId, track]));
    const duplicates = trackIds.flatMap((trackId) => {
      const track = duplicatesById.get(trackId);
      return track ? [track] : [];
    });
    const allowed = new Set(request.allowedDuplicateTrackIds ?? []);
    const unapproved = duplicates.filter((track) => !allowed.has(track.trackId));
    if (unapproved.length > 0) {
      return { status: 'needs_confirmation', duplicates: unapproved };
    }

    const maxRow = db.prepare(
      'SELECT MAX(position) as maxPos FROM playlist_tracks WHERE playlist_id = ?',
    ).get(request.playlistId) as { maxPos: number | null } | undefined;
    let nextPosition = (maxRow?.maxPos ?? -1) + 1;
    const insert = db.prepare(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path) VALUES (?, ?, ?, NULL)',
    );
    for (const trackId of trackIds) {
      insert.run(request.playlistId, trackId, nextPosition++);
    }
    db.prepare("UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?")
      .run(request.playlistId);
    return { status: 'added', addedCount: trackIds.length };
  })();
}
