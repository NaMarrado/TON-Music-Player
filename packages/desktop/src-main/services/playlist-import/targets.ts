import fs from 'fs';
import path from 'path';
import { getDb } from '../database';
import { findNonCollidingFileAsync, getPlaylistDir } from '../library-paths';

type ImportAssignment = { importItemIds: number[]; value: number };

const materializeChains = new Map<number, Promise<void>>();

function updateImportItems(
  column: 'queue_id' | 'track_id',
  assignments: ImportAssignment[],
): void {
  const db = getDb();
  for (const assignment of assignments) {
    if (assignment.importItemIds.length === 0) {
      continue;
    }
    const placeholders = assignment.importItemIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE playlist_import_items SET ${column} = ? WHERE id IN (${placeholders})`,
    ).run(assignment.value, ...assignment.importItemIds);
  }
}

export function assignDesktopPlaylistImportTracks(
  assignments: Array<{ importItemIds: number[]; trackId: number }>,
): void {
  getDb().transaction(() => {
    updateImportItems('track_id', assignments.map((assignment) => ({
      importItemIds: assignment.importItemIds,
      value: assignment.trackId,
    })));
  })();
}

export function assignDesktopPlaylistImportQueues(
  assignments: Array<{ importItemIds: number[]; queueId: number }>,
): void {
  const db = getDb();
  db.transaction(() => {
    updateImportItems('queue_id', assignments.map((assignment) => ({
      importItemIds: assignment.importItemIds,
      value: assignment.queueId,
    })));

    for (const assignment of assignments) {
      const queued = db.prepare(
        'SELECT source, source_id FROM download_queue WHERE id = ?',
      ).get(assignment.queueId) as {
        source: 'soundcloud' | 'spotify' | 'youtube';
        source_id: string | null;
      } | undefined;
      if (!queued?.source_id) {
        continue;
      }

      const sourceColumn = queued.source === 'spotify'
        ? 'spotify_id'
        : queued.source === 'soundcloud'
          ? 'soundcloud_id'
          : 'youtube_id';
      const track = db.prepare(
        `SELECT id FROM tracks WHERE ${sourceColumn} = ? ORDER BY added_at DESC, id DESC LIMIT 1`,
      ).get(queued.source_id) as { id: number } | undefined;
      if (track) {
        updateImportItems('track_id', [{
          importItemIds: assignment.importItemIds,
          value: track.id,
        }]);
      }
    }
  })();
}

async function copyTrackForPlaylist(
  playlistId: number,
  sourcePath: string | null,
): Promise<string | null> {
  if (!sourcePath) {
    return null;
  }
  try {
    await fs.promises.access(sourcePath);
    const playlistDir = getPlaylistDir(playlistId);
    await fs.promises.mkdir(playlistDir, { recursive: true });
    const destination = await findNonCollidingFileAsync(
      playlistDir,
      path.basename(sourcePath),
    );
    await fs.promises.copyFile(sourcePath, destination);
    return destination;
  } catch {
    return null;
  }
}

async function materializeImportSourceOnce(importSourceId: number): Promise<void> {
  const db = getDb();
  const source = db.prepare(
    'SELECT playlist_id FROM playlist_import_sources WHERE id = ?',
  ).get(importSourceId) as { playlist_id: number } | undefined;
  if (!source) {
    return;
  }

  const items = db.prepare(
    `SELECT pii.id, pii.source_position, pii.track_id,
            t.file_path AS source_file_path,
            pt.id AS playlist_track_id
     FROM playlist_import_items pii
     JOIN tracks t ON t.id = pii.track_id
     LEFT JOIN playlist_tracks pt ON pt.import_item_id = pii.id
     WHERE pii.import_source_id = ? AND pii.track_id IS NOT NULL
     ORDER BY pii.source_position ASC, pii.id ASC`,
  ).all(importSourceId) as Array<{
    id: number;
    playlist_track_id: number | null;
    source_file_path: string | null;
    source_position: number;
    track_id: number;
  }>;

  for (const item of items) {
    if (item.playlist_track_id != null) {
      db.prepare('UPDATE playlist_tracks SET track_id = ? WHERE id = ?')
        .run(item.track_id, item.playlist_track_id);
      continue;
    }

    const playlistFilePath = await copyTrackForPlaylist(
      source.playlist_id,
      item.source_file_path,
    );
    try {
      db.prepare(
        `INSERT INTO playlist_tracks (
           playlist_id, track_id, position, file_path, import_item_id
         ) VALUES (?, ?, 0, ?, ?)`,
      ).run(source.playlist_id, item.track_id, playlistFilePath, item.id);
    } catch (error) {
      if (playlistFilePath) {
        await fs.promises.unlink(playlistFilePath).catch(() => {});
      }
      const existing = db.prepare(
        'SELECT id FROM playlist_tracks WHERE import_item_id = ?',
      ).get(item.id);
      if (!existing) {
        throw error;
      }
    }
  }

  db.transaction(() => {
    const importedRows = db.prepare(
      `SELECT pt.id
       FROM playlist_tracks pt
       JOIN playlist_import_items pii ON pii.id = pt.import_item_id
       WHERE pii.import_source_id = ?
       ORDER BY pii.source_position ASC, pii.id ASC`,
    ).all(importSourceId) as Array<{ id: number }>;
    const updatePosition = db.prepare('UPDATE playlist_tracks SET position = ? WHERE id = ?');
    importedRows.forEach((row, index) => updatePosition.run(index, row.id));

    const manualRows = db.prepare(
      `SELECT id FROM playlist_tracks
       WHERE playlist_id = ? AND import_item_id IS NULL
       ORDER BY position ASC, id ASC`,
    ).all(source.playlist_id) as Array<{ id: number }>;
    manualRows.forEach((row, index) => (
      updatePosition.run(importedRows.length + index, row.id)
    ));
    db.prepare("UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?")
      .run(source.playlist_id);
  })();
}

export async function materializeDesktopPlaylistImport(
  importSourceId: number,
): Promise<void> {
  const previous = materializeChains.get(importSourceId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => materializeImportSourceOnce(importSourceId));
  materializeChains.set(importSourceId, current);
  try {
    await current;
  } finally {
    if (materializeChains.get(importSourceId) === current) {
      materializeChains.delete(importSourceId);
    }
  }
}

export async function settleDesktopPlaylistImportQueueItem(
  queueId: number,
  trackId: number,
): Promise<number[]> {
  const db = getDb();
  const sources = db.prepare(
    `SELECT DISTINCT pii.import_source_id, pis.playlist_id
     FROM playlist_import_items pii
     JOIN playlist_import_sources pis ON pis.id = pii.import_source_id
     WHERE pii.queue_id = ?`,
  ).all(queueId) as Array<{ import_source_id: number; playlist_id: number }>;
  if (sources.length === 0) {
    return [];
  }

  db.prepare('UPDATE playlist_import_items SET track_id = ? WHERE queue_id = ?')
    .run(trackId, queueId);
  await Promise.all(sources.map((source) => (
    materializeDesktopPlaylistImport(source.import_source_id)
  )));
  return [...new Set(sources.map((source) => source.playlist_id))];
}
