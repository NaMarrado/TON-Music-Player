import { ipcMain } from 'electron';
import type { Playlist } from '@ton/core';
import { getDb } from '../../../services/database';
import { cleanupOrphanedTrack, cleanupPlaylistFiles } from './helpers';

export function registerPlaylistListMutationHandlers(): void {
  ipcMain.handle('playlist:reorder-list', (_event, orderedIds: number[]) => {
    const db = getDb();
    const statement = db.prepare("UPDATE playlists SET sort_order = ?, updated_at = strftime('%s','now') WHERE id = ?");
    const run = db.transaction(() => {
      for (let index = 0; index < orderedIds.length; index += 1) {
        statement.run(index, orderedIds[index]);
      }
    });

    run();
  });

  ipcMain.handle(
    'playlist:create',
    (_event, data: { name: string; description?: string; is_smart?: boolean; smart_rules?: string }) => {
      const db = getDb();
      const result = db.prepare(
        `INSERT INTO playlists (name, description, is_smart, smart_rules)
         VALUES (?, ?, ?, ?)`,
      ).run(
        data.name,
        data.description || null,
        data.is_smart ? 1 : 0,
        data.smart_rules || null,
      );

      return db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid) as Playlist;
    },
  );

  ipcMain.handle(
    'playlist:update',
    (_event, id: number, data: { name?: string; description?: string; smart_rules?: string; cover_path?: string }) => {
      const db = getDb();
      const fields: string[] = [];
      const values: unknown[] = [];

      if (data.name !== undefined) {
        fields.push('name = ?');
        values.push(data.name);
      }
      if (data.description !== undefined) {
        fields.push('description = ?');
        values.push(data.description);
      }
      if (data.smart_rules !== undefined) {
        fields.push('smart_rules = ?');
        values.push(data.smart_rules);
      }
      if (data.cover_path !== undefined) {
        fields.push('cover_path = ?');
        values.push(data.cover_path);
      }

      if (fields.length === 0) {
        return;
      }

      fields.push("updated_at = strftime('%s','now')");
      values.push(id);
      db.prepare(`UPDATE playlists SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    },
  );

  ipcMain.handle('playlist:delete', async (_event, id: number) => {
    const db = getDb();
    const playlistTrackRows = db.prepare(
      'SELECT file_path, track_id FROM playlist_tracks WHERE playlist_id = ?',
    ).all(id) as Array<{ file_path: string | null; track_id: number }>;

    await cleanupPlaylistFiles(
      id,
      playlistTrackRows.map((row) => row.file_path),
    );

    db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    const orphanCandidateTrackIds = Array.from(
      new Set(playlistTrackRows.map((row) => row.track_id)),
    );
    await Promise.all(orphanCandidateTrackIds.map((trackId) => cleanupOrphanedTrack(trackId)));
  });
}
