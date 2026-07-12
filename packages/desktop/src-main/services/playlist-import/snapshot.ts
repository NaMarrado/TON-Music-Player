import fs from 'fs';
import type { LoadedPlaylistImport, Playlist } from '@ton/core';
import { getDb } from '../database';

export interface DesktopPlaylistImportSnapshotItem {
  id: number;
  position: number;
  sourceTrackId: string;
}

export interface DesktopPlaylistImportSnapshot {
  importSourceId: number;
  items: DesktopPlaylistImportSnapshotItem[];
  playlist: Playlist;
}

interface ExistingImportSourceRow {
  id: number;
  playlist_id: number;
  source_name: string;
}

export async function replaceDesktopPlaylistImportSnapshot(
  input: LoadedPlaylistImport,
): Promise<DesktopPlaylistImportSnapshot> {
  const db = getDb();
  const oldPlaylistFiles: string[] = [];

  const snapshot = db.transaction(() => {
    const existing = db.prepare(
      `SELECT id, playlist_id, source_name
       FROM playlist_import_sources
       WHERE source = ? AND source_id = ?`,
    ).get(input.source, input.sourceId) as ExistingImportSourceRow | undefined;

    let playlistId: number;
    let importSourceId: number;

    if (existing) {
      playlistId = existing.playlist_id;
      importSourceId = existing.id;
      const files = db.prepare(
        `SELECT pt.file_path
         FROM playlist_tracks pt
         JOIN playlist_import_items pii ON pii.id = pt.import_item_id
         WHERE pii.import_source_id = ? AND pt.file_path IS NOT NULL`,
      ).all(importSourceId) as Array<{ file_path: string }>;
      oldPlaylistFiles.push(...files.map((row) => row.file_path));

      db.prepare(
        `UPDATE playlists
         SET name = CASE WHEN name = ? THEN ? ELSE name END,
             updated_at = strftime('%s','now')
         WHERE id = ?`,
      ).run(existing.source_name, input.name, playlistId);
      db.prepare(
        `DELETE FROM playlist_tracks
         WHERE import_item_id IN (
           SELECT id FROM playlist_import_items WHERE import_source_id = ?
         )`,
      ).run(importSourceId);
      db.prepare('DELETE FROM playlist_import_items WHERE import_source_id = ?')
        .run(importSourceId);
      db.prepare(
        `UPDATE playlist_import_sources
         SET source_url = ?, source_name = ?, updated_at = strftime('%s','now')
         WHERE id = ?`,
      ).run(input.sourceUrl, input.name, importSourceId);
    } else {
      const maxOrder = db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS value FROM playlists',
      ).get() as { value: number };
      const playlistResult = db.prepare(
        `INSERT INTO playlists (name, description, cover_path, sort_order)
         VALUES (?, NULL, NULL, ?)`,
      ).run(input.name, maxOrder.value + 1);
      playlistId = Number(playlistResult.lastInsertRowid);

      const sourceResult = db.prepare(
        `INSERT INTO playlist_import_sources (
           playlist_id, source, source_id, source_url, source_name
         ) VALUES (?, ?, ?, ?, ?)`,
      ).run(playlistId, input.source, input.sourceId, input.sourceUrl, input.name);
      importSourceId = Number(sourceResult.lastInsertRowid);
    }

    const insertItem = db.prepare(
      `INSERT INTO playlist_import_items (
         import_source_id, source_track_id, source_position
       ) VALUES (?, ?, ?)`,
    );
    const items = input.tracks.map((track) => {
      const result = insertItem.run(importSourceId, track.sourceTrackId, track.position);
      return {
        id: Number(result.lastInsertRowid),
        position: track.position,
        sourceTrackId: track.sourceTrackId,
      };
    });
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?')
      .get(playlistId) as Playlist | undefined;
    if (!playlist) {
      throw new Error('playlist_import_create_failed');
    }

    return { importSourceId, items, playlist };
  })();

  await Promise.all(oldPlaylistFiles.map((filePath) => (
    fs.promises.unlink(filePath).catch(() => {})
  )));
  return snapshot;
}
