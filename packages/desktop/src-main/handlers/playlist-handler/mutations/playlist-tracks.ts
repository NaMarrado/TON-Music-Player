import fs from 'fs';
import path from 'path';
import { ipcMain } from 'electron';
import { findNonCollidingFileAsync, getPlaylistDir } from '../../../services/library-paths';
import { getDb } from '../../../services/database';
import { cleanupOrphanedTrack, touchPlaylist } from './helpers';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function registerPlaylistTrackMutationHandlers(): void {
  ipcMain.handle('playlist:add-tracks', async (_event, playlistId: number, trackIds: number[]) => {
    const db = getDb();
    const playlistDir = getPlaylistDir(playlistId);
    await fs.promises.mkdir(playlistDir, { recursive: true });

    const placeholders = trackIds.map(() => '?').join(',');
    const trackRows = placeholders
      ? (db.prepare(
          `SELECT id, file_path FROM tracks WHERE id IN (${placeholders})`,
        ).all(...trackIds) as Array<{ id: number; file_path: string | null }>)
      : [];
    const trackPathById = new Map(trackRows.map((row) => [row.id, row.file_path]));

    const maxRow = db.prepare(
      'SELECT MAX(position) as maxPos FROM playlist_tracks WHERE playlist_id = ?',
    ).get(playlistId) as { maxPos: number | null } | undefined;
    let nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const insert = db.prepare(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path) VALUES (?, ?, ?, ?)',
    );

    const preparedEntries: Array<{ trackId: number; playlistFilePath: string | null }> = [];
    const copiedPaths: string[] = [];
    for (const trackId of trackIds) {
      const sourcePath = trackPathById.get(trackId) ?? null;
      let playlistFilePath: string | null = null;
      if (sourcePath && await pathExists(sourcePath)) {
        playlistFilePath = await findNonCollidingFileAsync(playlistDir, path.basename(sourcePath));
        await fs.promises.copyFile(sourcePath, playlistFilePath);
        copiedPaths.push(playlistFilePath);
      }
      preparedEntries.push({ trackId, playlistFilePath });
    }

    const insertAll = db.transaction((entries: Array<{ trackId: number; playlistFilePath: string | null }>) => {
      for (const entry of entries) {
        insert.run(playlistId, entry.trackId, nextPosition, entry.playlistFilePath);
        nextPosition += 1;
      }
    });

    try {
      insertAll(preparedEntries);
    } catch (error) {
      await Promise.all(
        copiedPaths.map((filePath) => fs.promises.unlink(filePath).catch(() => {})),
      );
      throw error;
    }

    touchPlaylist(playlistId);
  });

  ipcMain.handle('playlist:remove-track', async (_event, playlistTrackId: number) => {
    const db = getDb();
    const row = db.prepare(
      'SELECT playlist_id, track_id, file_path, position FROM playlist_tracks WHERE id = ?',
    ).get(playlistTrackId) as {
      playlist_id: number;
      track_id: number;
      file_path: string | null;
      position: number;
    } | undefined;

    if (!row) {
      return;
    }

    db.transaction(() => {
      db.prepare('DELETE FROM playlist_tracks WHERE id = ?').run(playlistTrackId);
      db.prepare(`
        UPDATE playlist_tracks
        SET position = position - 1
        WHERE playlist_id = ? AND position > ?
      `).run(row.playlist_id, row.position);
    })();

    if (row.file_path) {
      await fs.promises.unlink(row.file_path).catch(() => {});
    }

    touchPlaylist(row.playlist_id);
    await cleanupOrphanedTrack(row.track_id);
  });

  ipcMain.handle('playlist:reorder', (_event, playlistId: number, orderedPlaylistTrackIds: number[]) => {
    const db = getDb();
    const update = db.prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?');

    db.transaction(() => {
      for (let index = 0; index < orderedPlaylistTrackIds.length; index += 1) {
        update.run(index, orderedPlaylistTrackIds[index]);
      }
    })();

    touchPlaylist(playlistId);
  });
}
