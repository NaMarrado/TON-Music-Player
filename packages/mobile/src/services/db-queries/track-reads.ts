import { SEARCH_RESULTS_LIMIT, buildSearchFtsQuery, type Track } from '@ton/core';
import { getDb } from '../database';

type LibraryListTrackRow = Pick<
  Track,
  | 'id'
  | 'file_path'
  | 'file_hash'
  | 'content_hash_sha256'
  | 'file_size'
  | 'file_mtime'
  | 'title'
  | 'artist'
  | 'album'
  | 'album_artist'
  | 'track_number'
  | 'disc_number'
  | 'duration_ms'
  | 'genre'
  | 'year'
  | 'bitrate'
  | 'sample_rate'
  | 'format'
  | 'cover_art_path'
  | 'loudness_lufs'
  | 'loudness_gain'
  | 'youtube_id'
  | 'spotify_id'
  | 'soundcloud_id'
  | 'source_url'
  | 'play_count'
  | 'last_played_at'
  | 'rating'
  | 'in_library'
  | 'added_at'
  | 'scanned_at'
>;

export async function getAllTracks(): Promise<Track[]> {
  const db = getDb();
  const rows = await db.getAllAsync<LibraryListTrackRow>(
    `SELECT
      id,
      file_path,
      file_hash,
      content_hash_sha256,
      file_size,
      file_mtime,
      title,
      artist,
      album,
      album_artist,
      track_number,
      disc_number,
      duration_ms,
      genre,
      year,
      bitrate,
      sample_rate,
      format,
      cover_art_path,
      loudness_lufs,
      loudness_gain,
      youtube_id,
      spotify_id,
      soundcloud_id,
      source_url,
      play_count,
      last_played_at,
      rating,
      in_library,
      added_at
      ,scanned_at
     FROM tracks
     WHERE in_library = 1
     ORDER BY added_at DESC`,
  );

  return rows.map((row) => ({
    id: row.id,
    file_path: row.file_path,
    file_hash: row.file_hash,
    content_hash_sha256: row.content_hash_sha256,
    file_size: row.file_size,
    file_mtime: row.file_mtime,
    title: row.title,
    artist: row.artist,
    album: row.album,
    album_artist: row.album_artist,
    track_number: row.track_number,
    disc_number: row.disc_number,
    duration_ms: row.duration_ms,
    genre: row.genre,
    year: row.year,
    bitrate: row.bitrate,
    sample_rate: row.sample_rate,
    format: row.format,
    cover_art_path: row.cover_art_path,
    loudness_lufs: row.loudness_lufs,
    loudness_gain: row.loudness_gain,
    youtube_id: row.youtube_id,
    spotify_id: row.spotify_id,
    soundcloud_id: row.soundcloud_id,
    source_url: row.source_url,
    play_count: row.play_count,
    last_played_at: row.last_played_at,
    rating: row.rating,
    in_library: row.in_library,
    added_at: row.added_at,
    scanned_at: row.scanned_at,
  }));
}

export async function getTrackById(id: number): Promise<Track | null> {
  const db = getDb();
  return db.getFirstAsync<Track>('SELECT * FROM tracks WHERE id = ?', [id]);
}

export async function getTracksByIds(ids: number[]): Promise<Track[]> {
  if (ids.length === 0) {
    return [];
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function getTracksMissingLoudness(): Promise<Array<Pick<Track, 'id' | 'file_path'>>> {
  const db = getDb();
  return db.getAllAsync<Pick<Track, 'id' | 'file_path'>>(
    `SELECT id, file_path
     FROM tracks
     WHERE loudness_gain IS NULL`,
  );
}

export async function getTrackLoudnessStats(): Promise<{
  total: number;
  analyzed: number;
  missing: number;
}> {
  const db = getDb();
  const [totalRow, analyzedRow] = await Promise.all([
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM tracks'),
    db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM tracks WHERE loudness_gain IS NOT NULL'),
  ]);

  const total = totalRow?.c ?? 0;
  const analyzed = analyzedRow?.c ?? 0;

  return {
    total,
    analyzed,
    missing: Math.max(0, total - analyzed),
  };
}

export async function searchTracksFts(
  query: string,
  limit = SEARCH_RESULTS_LIMIT,
  offset = 0,
): Promise<Track[]> {
  const ftsQuery = buildSearchFtsQuery(query);
  if (!ftsQuery) {
    return [];
  }

  const db = getDb();

  return db.getAllAsync<Track>(
    `SELECT t.* FROM tracks t
     JOIN tracks_fts fts ON fts.rowid = t.id
     WHERE tracks_fts MATCH ? AND t.in_library = 1
     ORDER BY bm25(tracks_fts, 10.0, 6.0, 3.0, 4.0, 1.0), t.id
     LIMIT ? OFFSET ?`,
    [ftsQuery, limit, offset],
  );
}
