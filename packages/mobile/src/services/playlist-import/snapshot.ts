import type { LoadedPlaylistImport, Playlist } from '@ton/core';
import { getDb } from '../database';

export interface MobilePlaylistImportSnapshotItem {
  id: number;
  position: number;
  sourceTrackId: string;
}

export interface MobilePlaylistImportSnapshot {
  importSourceId: number;
  items: MobilePlaylistImportSnapshotItem[];
  playlist: Playlist;
}

interface ExistingImportSourceRow {
  id: number;
  playlist_id: number;
  source_name: string;
}

function mapPlaylist(row: Playlist): Playlist {
  return { ...row, is_smart: Boolean(row.is_smart) };
}

export async function replacePlaylistImportSnapshot(
  input: LoadedPlaylistImport,
): Promise<MobilePlaylistImportSnapshot> {
  const db = getDb();
  let snapshot: MobilePlaylistImportSnapshot | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<ExistingImportSourceRow>(
      `SELECT id, playlist_id, source_name
       FROM playlist_import_sources
       WHERE source = ? AND source_id = ?`,
      [input.source, input.sourceId],
    );

    let playlistId: number;
    let importSourceId: number;

    if (existing) {
      playlistId = existing.playlist_id;
      importSourceId = existing.id;

      await txn.runAsync(
        `UPDATE playlists
         SET name = CASE WHEN name = ? THEN ? ELSE name END,
             updated_at = strftime('%s','now')
         WHERE id = ?`,
        [existing.source_name, input.name, playlistId],
      );
      await txn.runAsync(
        `DELETE FROM playlist_tracks
         WHERE import_item_id IN (
           SELECT id FROM playlist_import_items WHERE import_source_id = ?
         )`,
        [importSourceId],
      );
      await txn.runAsync(
        'DELETE FROM playlist_import_items WHERE import_source_id = ?',
        [importSourceId],
      );
      await txn.runAsync(
        `UPDATE playlist_import_sources
         SET source_url = ?, source_name = ?, updated_at = strftime('%s','now')
         WHERE id = ?`,
        [input.sourceUrl, input.name, importSourceId],
      );
    } else {
      const maxOrder = await txn.getFirstAsync<{ value: number }>(
        'SELECT COALESCE(MAX(sort_order), -1) AS value FROM playlists',
      );
      const playlistResult = await txn.runAsync(
        `INSERT INTO playlists (name, description, cover_path, sort_order)
         VALUES (?, NULL, NULL, ?)`,
        [input.name, (maxOrder?.value ?? -1) + 1],
      );
      playlistId = playlistResult.lastInsertRowId;

      const sourceResult = await txn.runAsync(
        `INSERT INTO playlist_import_sources (
           playlist_id, source, source_id, source_url, source_name
         ) VALUES (?, ?, ?, ?, ?)`,
        [playlistId, input.source, input.sourceId, input.sourceUrl, input.name],
      );
      importSourceId = sourceResult.lastInsertRowId;
    }

    const items: MobilePlaylistImportSnapshotItem[] = [];
    for (const track of input.tracks) {
      const result = await txn.runAsync(
        `INSERT INTO playlist_import_items (
           import_source_id, source_track_id, source_position
         ) VALUES (?, ?, ?)`,
        [importSourceId, track.sourceTrackId, track.position],
      );
      items.push({
        id: result.lastInsertRowId,
        position: track.position,
        sourceTrackId: track.sourceTrackId,
      });
    }

    const playlist = await txn.getFirstAsync<Playlist>(
      'SELECT * FROM playlists WHERE id = ?',
      [playlistId],
    );
    if (!playlist) {
      throw new Error('playlist_import_create_failed');
    }

    snapshot = {
      importSourceId,
      items,
      playlist: mapPlaylist(playlist),
    };
  });

  if (!snapshot) {
    throw new Error('playlist_import_create_failed');
  }
  return snapshot;
}
