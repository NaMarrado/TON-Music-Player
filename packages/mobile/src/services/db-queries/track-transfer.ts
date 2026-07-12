import type { Track } from '@ton/core';
import { getDb } from '../database';

type TrackAssetRow = Pick<Track, 'id' | 'file_path' | 'cover_art_path' | 'in_library'>;

export async function getAllTracksForTransfer(): Promise<Track[]> {
  const db = getDb();
  return db.getAllAsync<Track>(
    `SELECT *
     FROM tracks
     ORDER BY added_at DESC, id DESC`,
  );
}

export async function getTrackIdsByHashes(hashes: string[]): Promise<Record<string, number>> {
  if (hashes.length === 0) {
    return {};
  }

  const db = getDb();
  const placeholders = hashes.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ id: number; file_hash: string }>(
    `SELECT id, file_hash
     FROM tracks
     WHERE file_hash IN (${placeholders})
     ORDER BY id ASC`,
    hashes,
  );

  const mapping: Record<string, number> = {};
  for (const row of rows) {
    if (!(row.file_hash in mapping)) {
      mapping[row.file_hash] = row.id;
    }
  }

  return mapping;
}

export async function getAllTrackIdsByHash(): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db.getAllAsync<{ id: number; file_hash: string }>(
    `SELECT id, file_hash
     FROM tracks
     WHERE file_hash IS NOT NULL AND file_hash != ''
     ORDER BY id ASC`,
  );

  const mapping: Record<string, number> = {};
  for (const row of rows) {
    if (!(row.file_hash in mapping)) {
      mapping[row.file_hash] = row.id;
    }
  }

  return mapping;
}

export async function getTrackAssetRowsByIds(ids: number[]): Promise<TrackAssetRow[]> {
  if (ids.length === 0) {
    return [];
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.getAllAsync<TrackAssetRow>(
    `SELECT id, file_path, cover_art_path, in_library
     FROM tracks
     WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function getAllTrackAssetRows(): Promise<TrackAssetRow[]> {
  const db = getDb();
  return db.getAllAsync<TrackAssetRow>(
    `SELECT id, file_path, cover_art_path, in_library
     FROM tracks`,
  );
}

export async function getTrackIdsBySourceIdentity(
  source: 'youtube' | 'spotify' | 'soundcloud',
  sourceIds: string[],
): Promise<Record<string, number>> {
  if (sourceIds.length === 0) {
    return {};
  }

  const db = getDb();
  const column =
    source === 'youtube'
      ? 'youtube_id'
      : source === 'spotify'
        ? 'spotify_id'
        : 'soundcloud_id';
  const placeholders = sourceIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ id: number; source_id: string }>(
    `SELECT id, ${column} AS source_id
     FROM tracks
     WHERE in_library = 1 AND ${column} IN (${placeholders})`,
    sourceIds,
  );

  return Object.fromEntries(rows.map((row) => [row.source_id, row.id]));
}
