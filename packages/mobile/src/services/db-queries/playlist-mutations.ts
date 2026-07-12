import type { Playlist } from '@ton/core';
import { getDb } from '../database';

export interface RemovedPlaylistTrack {
  playlistId: number;
  trackId: number;
  position: number;
}

export async function createPlaylist(
  name: string,
  description?: string,
): Promise<Playlist> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const maxOrder = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM playlists',
  );
  const sortOrder = (maxOrder?.m ?? 0) + 1;
  const result = await db.runAsync(
    'INSERT INTO playlists (name, description, sort_order) VALUES (?, ?, ?)',
    [name, description ?? null, sortOrder],
  );

  return {
    id: result.lastInsertRowId,
    cloud_id: null,
    name,
    description: description ?? null,
    cover_path: null,
    is_smart: false,
    smart_rules: null,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };
}

export async function updatePlaylist(
  id: number,
  fields: Partial<Pick<Playlist, 'name' | 'description' | 'cover_path'>>,
): Promise<void> {
  const db = getDb();
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }

  const sets = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value ?? null);
  await db.runAsync(
    `UPDATE playlists SET ${sets}, updated_at = ? WHERE id = ?`,
    [...values, Math.floor(Date.now() / 1000), id],
  );
}

export async function deletePlaylist(id: number): Promise<number[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ track_id: number }>(
    'SELECT DISTINCT track_id FROM playlist_tracks WHERE playlist_id = ?',
    [id],
  );
  await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
  return rows.map((row) => row.track_id);
}

export async function addTracksToPlaylist(
  playlistId: number,
  trackIds: number[],
): Promise<void> {
  if (trackIds.length === 0) {
    return;
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  await db.withTransactionAsync(async () => {
    const maxPos = await db.getFirstAsync<{ m: number }>(
      'SELECT COALESCE(MAX(position), 0) as m FROM playlist_tracks WHERE playlist_id = ?',
      [playlistId],
    );

    let position = (maxPos?.m ?? 0) + 1;
    for (const trackId of trackIds) {
      await db.runAsync(
        'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
        [playlistId, trackId, position++],
      );
    }

    await db.runAsync(
      'UPDATE playlists SET updated_at = ? WHERE id = ?',
      [now, playlistId],
    );
  });
}

export async function removeTrackFromPlaylist(
  playlistTrackId: number,
): Promise<RemovedPlaylistTrack | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{
    playlist_id: number;
    track_id: number;
    position: number;
  }>(
    `SELECT playlist_id, track_id, position
     FROM playlist_tracks
     WHERE id = ?`,
    [playlistTrackId],
  );

  if (!row) {
    return null;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM playlist_tracks WHERE id = ?', [playlistTrackId]);
    await db.runAsync(
      `UPDATE playlist_tracks
       SET position = position - 1
       WHERE playlist_id = ? AND position > ?`,
      [row.playlist_id, row.position],
    );
    await db.runAsync(
      'UPDATE playlists SET updated_at = ? WHERE id = ?',
      [Math.floor(Date.now() / 1000), row.playlist_id],
    );
  });

  return {
    playlistId: row.playlist_id,
    trackId: row.track_id,
    position: row.position,
  };
}

export async function reorderPlaylistTracks(
  playlistId: number,
  orderedPlaylistTrackIds: number[],
): Promise<void> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  await db.withTransactionAsync(async () => {
    for (let index = 0; index < orderedPlaylistTrackIds.length; index += 1) {
      await db.runAsync(
        'UPDATE playlist_tracks SET position = ? WHERE id = ? AND playlist_id = ?',
        [index, orderedPlaylistTrackIds[index], playlistId],
      );
    }

    await db.runAsync(
      'UPDATE playlists SET updated_at = ? WHERE id = ?',
      [now, playlistId],
    );
  });
}
