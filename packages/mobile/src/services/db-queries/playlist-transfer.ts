import type { Playlist } from '@ton/core';
import { getDb } from '../database';
import type { SQLiteDatabase } from 'expo-sqlite';

export type PlaylistCoverPathRow = Pick<Playlist, 'id' | 'cover_path'>;

export async function getPlaylistCoverPathRows(
  database?: SQLiteDatabase,
): Promise<PlaylistCoverPathRow[]> {
  const db = database ?? getDb();
  return db.getAllAsync<PlaylistCoverPathRow>(
    `SELECT id, cover_path
     FROM playlists
     WHERE cover_path IS NOT NULL AND cover_path != ''`,
  );
}
