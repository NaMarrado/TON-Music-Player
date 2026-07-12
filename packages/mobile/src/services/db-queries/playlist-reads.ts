import type { Playlist, PlaylistTrackEntry } from '@ton/core';
import { getDb } from '../database';

function mapPlaylist(row: Playlist): Playlist {
  return { ...row, is_smart: !!row.is_smart };
}

export async function getAllPlaylists(): Promise<Playlist[]> {
  const db = getDb();
  const rows = await db.getAllAsync<Playlist>(
    'SELECT * FROM playlists ORDER BY sort_order ASC, created_at DESC',
  );
  return rows.map(mapPlaylist);
}

export async function getPlaylistById(id: number): Promise<Playlist | null> {
  const db = getDb();
  const row = await db.getFirstAsync<Playlist>('SELECT * FROM playlists WHERE id = ?', [id]);
  return row ? mapPlaylist(row) : null;
}

export async function getPlaylistTracks(
  playlistId: number,
): Promise<PlaylistTrackEntry[]> {
  const db = getDb();
  return db.getAllAsync<PlaylistTrackEntry>(
    `SELECT t.*, pt.id as playlist_track_id, pt.position
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
    [playlistId],
  );
}

export async function getPlaylistMembershipsForTrack(
  trackId: number,
  playlistIds: number[],
): Promise<Array<PlaylistTrackEntry & { playlist_id: number; position: number }>> {
  if (playlistIds.length === 0) return [];
  const db = getDb();
  const placeholders = playlistIds.map(() => '?').join(',');
  return db.getAllAsync<PlaylistTrackEntry & { playlist_id: number; position: number }>(
    `SELECT t.*, pt.id AS playlist_track_id, pt.playlist_id, pt.position
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.track_id = ? AND pt.playlist_id IN (${placeholders})
     ORDER BY pt.playlist_id, pt.position`,
    [trackId, ...playlistIds],
  );
}

export async function getPlaylistTrackCount(playlistId: number): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM playlist_tracks WHERE playlist_id = ?',
    [playlistId],
  );
  return row?.c ?? 0;
}

export async function getPlaylistReferenceCounts(trackIds: number[]): Promise<Record<number, number>> {
  if (trackIds.length === 0) {
    return {};
  }

  const db = getDb();
  const placeholders = trackIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ track_id: number; refs: number }>(
    `SELECT track_id, COUNT(*) as refs
     FROM playlist_tracks
     WHERE track_id IN (${placeholders})
     GROUP BY track_id`,
    trackIds,
  );

  const counts = Object.fromEntries(trackIds.map((trackId) => [trackId, 0]));
  for (const row of rows) {
    counts[row.track_id] = row.refs;
  }

  return counts;
}
