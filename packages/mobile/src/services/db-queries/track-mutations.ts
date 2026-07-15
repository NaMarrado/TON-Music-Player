import type { Track } from '@ton/core';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../database';

const TRACK_COLUMNS = new Set([
  'file_path', 'file_hash', 'content_hash_sha256', 'file_size', 'file_mtime',
  'title', 'artist', 'album', 'album_artist',
  'track_number', 'disc_number', 'duration_ms', 'genre', 'year',
  'bitrate', 'sample_rate', 'format', 'cover_art_path',
  'loudness_lufs', 'loudness_gain',
  'youtube_id', 'spotify_id', 'soundcloud_id', 'source_url',
  'last_played_at', 'rating', 'downloaded_at', 'in_library',
]);

export async function insertTrack(
  track: Omit<Track, 'id' | 'play_count' | 'added_at' | 'downloaded_at' | 'scanned_at' | 'content_hash_sha256'> & {
    content_hash_sha256?: string | null;
    downloaded_at?: number | null;
  },
  database?: SQLiteDatabase,
): Promise<number> {
  const db = database ?? getDb();
  const result = await db.runAsync(
    `INSERT INTO tracks (
      file_path, file_hash, file_size, file_mtime,
      content_hash_sha256,
      title, artist, album, album_artist,
      track_number, disc_number, duration_ms, genre, year,
      bitrate, sample_rate, format, cover_art_path,
      loudness_lufs, loudness_gain,
      youtube_id, spotify_id, soundcloud_id, source_url,
      last_played_at, rating, downloaded_at, in_library
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      track.file_path,
      track.file_hash ?? null,
      track.file_size ?? null,
      track.file_mtime ?? null,
      track.content_hash_sha256 ?? null,
      track.title ?? null,
      track.artist ?? null,
      track.album ?? null,
      track.album_artist ?? null,
      track.track_number ?? null,
      track.disc_number ?? null,
      track.duration_ms ?? null,
      track.genre ?? null,
      track.year ?? null,
      track.bitrate ?? null,
      track.sample_rate ?? null,
      track.format ?? null,
      track.cover_art_path ?? null,
      track.loudness_lufs ?? null,
      track.loudness_gain ?? null,
      track.youtube_id ?? null,
      track.spotify_id ?? null,
      track.soundcloud_id ?? null,
      track.source_url ?? null,
      track.last_played_at ?? null,
      track.rating ?? null,
      track.downloaded_at ?? null,
      1,
    ],
  );
  return result.lastInsertRowId;
}

export async function updateTrack(
  id: number,
  fields: Partial<Track>,
  database?: SQLiteDatabase,
): Promise<void> {
  const db = database ?? getDb();
  const entries = Object.entries(fields).filter(
    ([key]) => key !== 'id' && TRACK_COLUMNS.has(key),
  );
  if (entries.length === 0) {
    return;
  }

  const sets = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => value ?? null);
  await db.runAsync(`UPDATE tracks SET ${sets} WHERE id = ?`, [...values, id]);
}

export async function updateTrackLoudness(
  id: number,
  loudnessLufs: number,
  loudnessGain: number,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE tracks
     SET loudness_lufs = ?, loudness_gain = ?
     WHERE id = ?`,
    [loudnessLufs, loudnessGain, id],
  );
}

export async function updateTracksInLibrary(ids: number[], _inLibrary: 0 | 1): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE tracks
     SET in_library = 1
     WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function deleteTrack(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM tracks WHERE id = ?', [id]);
}

export async function deleteTracks(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM tracks WHERE id IN (${placeholders})`, ids);
}

export async function incrementTrackPlayCount(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE tracks SET play_count = play_count + 1, last_played_at = ? WHERE id = ?',
    [Math.floor(Date.now() / 1000), id],
  );
}
