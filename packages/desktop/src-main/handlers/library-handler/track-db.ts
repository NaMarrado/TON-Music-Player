import type Database from 'better-sqlite3';
import { getDb } from '../../services/database';
import type { readTrackMetadata } from '../../services/metadata-reader';
import type { ExistingLibraryTrack, ExistingTrackRow, FileStats } from './types';

type TrackMetadata = Awaited<ReturnType<typeof readTrackMetadata>>;
type TrackInsertStatement = Database.Statement<TrackInsertParams>;
type EnsureInLibraryStatement = Database.Statement<[number]>;

export type TrackInsertParams = [
  string,
  string | null,
  number,
  number,
  string | null,
  string | null,
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
  string | null,
  number | null,
  number | null,
  number | null,
  string | null,
  string | null,
];

const TRACK_INSERT_COLUMNS = `
  file_path, file_hash, file_size, file_mtime,
  title, artist, album, album_artist,
  track_number, disc_number, duration_ms,
  genre, year, bitrate, sample_rate, format,
  cover_art_path
`;

export function createLibraryTrackInsertStatement(
  db: ReturnType<typeof getDb>,
  options: { ignoreDuplicates?: boolean } = {},
): TrackInsertStatement {
  const insertKeyword = options.ignoreDuplicates ? 'INSERT OR IGNORE' : 'INSERT';

  return db.prepare(`
    ${insertKeyword} INTO tracks (
      ${TRACK_INSERT_COLUMNS}
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?
    )
  `);
}

export function buildTrackInsertParams(
  filePath: string,
  stats: FileStats,
  meta: TrackMetadata,
): TrackInsertParams {
  return [
    filePath,
    meta.file_hash,
    stats.size,
    stats.mtimeMs,
    meta.title,
    meta.artist,
    meta.album,
    meta.album_artist,
    meta.track_number,
    meta.disc_number,
    meta.duration_ms,
    meta.genre,
    meta.year,
    meta.bitrate,
    meta.sample_rate,
    meta.format,
    meta.cover_art_path,
  ];
}

export function createEnsureInLibraryStatement(
  db: ReturnType<typeof getDb>,
): EnsureInLibraryStatement {
  return db.prepare('UPDATE tracks SET in_library = 1 WHERE id = ? AND in_library = 0');
}

export function getExistingTrackByPath(
  db: ReturnType<typeof getDb>,
  filePath: string,
): ExistingLibraryTrack | undefined {
  return db
    .prepare('SELECT id, in_library FROM tracks WHERE file_path = ?')
    .get(filePath) as ExistingLibraryTrack | undefined;
}

export function getExistingTrackState(db: ReturnType<typeof getDb>) {
  const existingPaths = new Set<string>();
  const existingHashes = new Set<string>();
  const rows = db.prepare('SELECT file_path, file_hash FROM tracks').all() as ExistingTrackRow[];

  for (const row of rows) {
    existingPaths.add(row.file_path);
    if (row.file_hash) {
      existingHashes.add(row.file_hash);
    }
  }

  return { existingPaths, existingHashes };
}
