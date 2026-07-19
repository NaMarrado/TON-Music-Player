import { ipcMain } from 'electron';
import type { PlaylistAddTracksRequest } from '@ton/core';
import { getDb } from '../../../services/database';
import { touchPlaylist } from './helpers';
import { addTracksToPlaylistAtomic } from './add-tracks-atomic';

export function registerPlaylistTrackMutationHandlers(): void {
  ipcMain.handle('playlist:add-tracks', async (
    _event,
    request: PlaylistAddTracksRequest,
  ) => addTracksToPlaylistAtomic(getDb(), request));

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
