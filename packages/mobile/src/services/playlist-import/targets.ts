import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../database';
import { reconcileLibraryTracks } from '../../stores/library-store';

export interface PlaylistImportTargetAssignments {
  queue: Array<{ importItemIds: number[]; queueId: number }>;
  tracks: Array<{ importItemIds: number[]; trackId: number }>;
}

async function reconcileImportedPlaylist(
  db: SQLiteDatabase,
  importSourceId: number,
): Promise<number | null> {
  const source = await db.getFirstAsync<{ playlist_id: number }>(
    'SELECT playlist_id FROM playlist_import_sources WHERE id = ?',
    [importSourceId],
  );
  if (!source) {
    return null;
  }

  await db.runAsync(
    `UPDATE tracks
     SET in_library = 1
     WHERE id IN (
       SELECT track_id
       FROM playlist_import_items
       WHERE import_source_id = ? AND track_id IS NOT NULL
     )`,
    [importSourceId],
  );

  const importedItems = await db.getAllAsync<{
    id: number;
    source_position: number;
    track_id: number;
  }>(
    `SELECT id, source_position, track_id
     FROM playlist_import_items
     WHERE import_source_id = ? AND track_id IS NOT NULL
     ORDER BY source_position ASC, id ASC`,
    [importSourceId],
  );

  for (const item of importedItems) {
    await db.runAsync(
      `INSERT INTO playlist_tracks (playlist_id, track_id, position, import_item_id)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(import_item_id) DO UPDATE SET track_id = excluded.track_id`,
      [source.playlist_id, item.track_id, item.id],
    );
  }

  for (let index = 0; index < importedItems.length; index += 1) {
    await db.runAsync(
      `UPDATE playlist_tracks
       SET position = ?
       WHERE import_item_id = ? AND playlist_id = ?`,
      [index, importedItems[index].id, source.playlist_id],
    );
  }

  const manualRows = await db.getAllAsync<{ id: number }>(
    `SELECT id
     FROM playlist_tracks
     WHERE playlist_id = ? AND import_item_id IS NULL
     ORDER BY position ASC, id ASC`,
    [source.playlist_id],
  );
  for (let index = 0; index < manualRows.length; index += 1) {
    await db.runAsync(
      'UPDATE playlist_tracks SET position = ? WHERE id = ?',
      [importedItems.length + index, manualRows[index].id],
    );
  }

  await db.runAsync(
    "UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?",
    [source.playlist_id],
  );
  return source.playlist_id;
}

async function updateImportItemIds(
  db: SQLiteDatabase,
  itemIds: number[],
  column: 'queue_id' | 'track_id',
  value: number,
): Promise<void> {
  if (itemIds.length === 0) {
    return;
  }
  const placeholders = itemIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE playlist_import_items SET ${column} = ? WHERE id IN (${placeholders})`,
    [value, ...itemIds],
  );
}

export async function assignPlaylistImportTargets(
  assignments: PlaylistImportTargetAssignments,
  importSourceIdsToReconcile: number[] = [],
): Promise<number[]> {
  const db = getDb();
  const affectedPlaylistIds = new Set<number>();
  const trackIdsToRevalidate = new Set(
    assignments.tracks.map((assignment) => assignment.trackId),
  );

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const assignment of assignments.tracks) {
      await txn.runAsync('UPDATE tracks SET in_library = 1 WHERE id = ?', [assignment.trackId]);
      await updateImportItemIds(txn, assignment.importItemIds, 'track_id', assignment.trackId);
    }
    for (const assignment of assignments.queue) {
      await updateImportItemIds(txn, assignment.importItemIds, 'queue_id', assignment.queueId);
    }
    const importSourceIds = new Set(importSourceIdsToReconcile);
    for (const queueId of new Set(assignments.queue.map((assignment) => assignment.queueId))) {
      const queued = await txn.getFirstAsync<{
        source: 'spotify' | 'youtube';
        source_id: string;
        status: string;
      }>(
        'SELECT source, source_id, status FROM download_queue WHERE id = ?',
        [queueId],
      );
      if (!queued || queued.status !== 'completed') {
        continue;
      }
      const sourceColumn = queued.source === 'spotify' ? 'spotify_id' : 'youtube_id';
      const track = await txn.getFirstAsync<{ id: number }>(
        `SELECT id FROM tracks WHERE ${sourceColumn} = ? ORDER BY added_at DESC LIMIT 1`,
        [queued.source_id],
      );
      if (!track) {
        continue;
      }
      trackIdsToRevalidate.add(track.id);
      const sources = await txn.getAllAsync<{ import_source_id: number }>(
        'SELECT DISTINCT import_source_id FROM playlist_import_items WHERE queue_id = ?',
        [queueId],
      );
      await txn.runAsync(
        'UPDATE playlist_import_items SET track_id = ? WHERE queue_id = ?',
        [track.id, queueId],
      );
      sources.forEach((source) => importSourceIds.add(source.import_source_id));
    }

    for (const importSourceId of importSourceIds) {
      const playlistId = await reconcileImportedPlaylist(txn, importSourceId);
      if (playlistId != null) {
        affectedPlaylistIds.add(playlistId);
      }
    }
  });

  if (trackIdsToRevalidate.size > 0) {
    await reconcileLibraryTracks().catch(() => {});
  }

  return [...affectedPlaylistIds];
}

export async function settlePlaylistImportQueueItem(
  queueId: number,
  trackId: number,
): Promise<number[]> {
  const db = getDb();
  const affectedPlaylistIds = new Set<number>();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const sources = await txn.getAllAsync<{ import_source_id: number }>(
      `SELECT DISTINCT import_source_id
       FROM playlist_import_items
       WHERE queue_id = ?`,
      [queueId],
    );
    if (sources.length === 0) {
      return;
    }

    await txn.runAsync(
      'UPDATE playlist_import_items SET track_id = ? WHERE queue_id = ?',
      [trackId, queueId],
    );
    for (const source of sources) {
      const playlistId = await reconcileImportedPlaylist(txn, source.import_source_id);
      if (playlistId != null) {
        affectedPlaylistIds.add(playlistId);
      }
    }
  });

  return [...affectedPlaylistIds];
}
