import { ipcMain } from 'electron';
import type { Playlist, PlaylistTrackEntry, SmartPlaylistConfig, Track } from '@ton/core';
import { buildSmartPlaylistQuery } from '@ton/core';
import { getDb } from '../../services/database';
import { normalizePlaylistCover, normalizePlaylistCovers } from './cover-paths';
import { getPlaylistLibraryStatus, addPlaylistTracksToLibrary } from '../playlist-library-status';

export function registerPlaylistQueryHandlers(): void {
  ipcMain.handle('playlist:list', async () => {
    const db = getDb();
    const playlists = db
      .prepare('SELECT * FROM playlists ORDER BY sort_order ASC, updated_at DESC')
      .all() as Playlist[];
    return await normalizePlaylistCovers(playlists);
  });

  ipcMain.handle('playlist:get', async (_event, id: number) => {
    const db = getDb();
    const rawPlaylist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as Playlist | undefined;
    const playlist = await normalizePlaylistCover(rawPlaylist ?? null);
    if (!playlist) {
      return null;
    }

    if (playlist.is_smart && playlist.smart_rules) {
      const config = JSON.parse(playlist.smart_rules) as SmartPlaylistConfig;
      const { sql, params } = buildSmartPlaylistQuery(config);
      const rawTracks = db.prepare(sql).all(...params) as Track[];
      const tracks = rawTracks.map((track) => (
        { ...track, playlist_track_id: track.id }
      )) as PlaylistTrackEntry[];
      return { playlist, tracks };
    }

    const tracks = db.prepare(
      `SELECT t.*, pt.id as playlist_track_id, pt.position,
              COALESCE(pt.file_path, t.file_path) as file_path
       FROM tracks t
       JOIN playlist_tracks pt ON pt.track_id = t.id
       WHERE pt.playlist_id = ?
       ORDER BY pt.position ASC`,
    ).all(id) as PlaylistTrackEntry[];

    return { playlist, tracks };
  });

  ipcMain.handle('playlist:smart-query', (_event, config: SmartPlaylistConfig) => {
    const db = getDb();
    const { sql, params } = buildSmartPlaylistQuery(config);
    return db.prepare(sql).all(...params) as Track[];
  });

  ipcMain.handle('playlist:library-status', (_event, playlistId: number) => (
    getPlaylistLibraryStatus(playlistId)
  ));

  ipcMain.handle('playlist:add-to-library', async (_event, playlistId: number, forceAll?: boolean) => (
    addPlaylistTracksToLibrary(playlistId, forceAll)
  ));
}
