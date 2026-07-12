import { ipcMain } from 'electron';
import { getDb } from '../../../services/database';
import { touchPlaylist } from './helpers';

export function registerPlaylistTrackMutationHandlers(): void {
  ipcMain.handle('playlist:add-tracks', async (_event, playlistId: number, trackIds: number[]) => {
    const db = getDb();
    const maxRow = db.prepare(
      'SELECT MAX(position) as maxPos FROM playlist_tracks WHERE playlist_id = ?',
    ).get(playlistId) as { maxPos: number | null } | undefined;
    let nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const insert = db.prepare(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path) VALUES (?, ?, ?, NULL)',
    );

    const insertAll = db.transaction((ids: number[]) => {
      for (const trackId of ids) {
        insert.run(playlistId, trackId, nextPosition);
        nextPosition += 1;
      }
    });
    insertAll(trackIds);

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

    touchPlaylist(row.playlist_id);
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
