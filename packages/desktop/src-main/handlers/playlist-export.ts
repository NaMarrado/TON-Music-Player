/**
 * Playlist export handler — exports a playlist as a .zip archive.
 */

import path from 'path';
import fs from 'fs';
import { BrowserWindow, app, dialog } from 'electron';
import type { Playlist, Track } from '@ton/core';
import { getDb } from '../services/database';
import { createPlaylistArchiveOffthread } from '../services/export-import-offload';

/** Export a playlist as a .zip archive. Returns the output path or null. */
export async function handleExportPlaylist(playlistId: number): Promise<string | null> {
  const db = getDb();
  const playlist = db
    .prepare('SELECT * FROM playlists WHERE id = ?')
    .get(playlistId) as Playlist | undefined;
  if (!playlist) return null;

  // Use COALESCE so we export the playlist's own file copies when available
  const tracks = db
    .prepare(
      `SELECT t.*, COALESCE(pt.file_path, t.file_path) as file_path
       FROM tracks t
       JOIN playlist_tracks pt ON pt.track_id = t.id
       WHERE pt.playlist_id = ?
       ORDER BY pt.position ASC`,
    )
    .all(playlistId) as Track[];

  if (tracks.length === 0) return null;

  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return null;

  const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '_');
  const result = await dialog.showSaveDialog(win, {
    title: 'Export playlist',
    defaultPath: path.join(app.getPath('downloads'), `${safeName}.zip`),
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return null;

  await fs.promises.rm(result.filePath, { force: true }).catch(() => {});
  await createPlaylistArchiveOffthread(
    result.filePath,
    {
      name: playlist.name,
      cover_path: playlist.cover_path,
    },
    tracks.map((track) => ({
      file_path: track.file_path,
      cover_art_path: track.cover_art_path,
      title: track.title,
      artist: track.artist,
      album: track.album,
    })),
    () => {},
  );

  return result.filePath;
}
