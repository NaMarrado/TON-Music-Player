import path from 'node:path';
import { app, BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';
import type { Playlist } from '@ton/core';
import { getDb } from '../services/database';
import { startLibraryExport } from './export-import-handler/export-flow';

/** Export one playlist through the same canonical bundle used on mobile. */
export async function handleExportPlaylist(
  event: IpcMainInvokeEvent,
  playlistId: number,
  destinationPath?: string,
): Promise<string | null> {
  const playlist = getDb()
    .prepare('SELECT * FROM playlists WHERE id = ?')
    .get(playlistId) as Playlist | undefined;
  if (!playlist) {
    return null;
  }

  let outputPath = destinationPath ?? null;
  if (!outputPath) {
    const win = BrowserWindow.fromWebContents(event.sender)
      ?? BrowserWindow.getFocusedWindow()
      ?? BrowserWindow.getAllWindows()[0];
    if (!win) {
      return null;
    }

    const safeName = playlist.name.replace(/[<>:"/\\|?*]/g, '_');
    const result = await dialog.showSaveDialog(win, {
      title: 'Export playlist',
      defaultPath: path.join(app.getPath('downloads'), `${safeName}.zip`),
      filters: [{ name: 'TON Playlist', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    outputPath = result.filePath;
  }

  const result = await startLibraryExport(event, {
    bundleFormat: 'archive',
    destinationPath: outputPath,
    includeLibrary: false,
    playlistIds: [playlistId],
  });

  return result.playlistCount === 1 ? outputPath : null;
}
