import fs from 'fs';
import path from 'path';
import type { Playlist } from '@ton/core';
import { getDb } from '../../../services/database';
import { getFileStatsAsync } from '../../../services/file-scanner';
import { findNonCollidingFileAsync, getPlaylistDir } from '../../../services/library-paths';
import { readTrackMetadata } from '../../../services/metadata-reader';
import type { TrackMetaEntry } from '../../playlist-helpers';
import { getExistingLibraryHashes } from '../hashes';
import type { ImportedPlaylistTrack } from '../types';
import {
  applySavedMetadata,
  attachImportedTracks,
  scheduleImportedTrackLoudness,
  sortSourceFilesBySavedPosition,
  syncPlaylistCover,
} from './folder-track-helpers';

export async function importFolderTracks(
  playlistName: string,
  sourceFiles: string[],
  coverPath: string | null = null,
  tracksMeta?: Record<string, TrackMetaEntry>,
  artworkMap?: Map<string, string>,
  skipExisting = false,
): Promise<Playlist> {
  const db = getDb();

  sortSourceFilesBySavedPosition(sourceFiles, tracksMeta);

  const existingHashes = skipExisting ? getExistingLibraryHashes(db) : new Set<string>();
  const playlistResult = db
    .prepare('INSERT INTO playlists (name, cover_path) VALUES (?, ?)')
    .run(playlistName, coverPath || null);
  const playlistId = Number(playlistResult.lastInsertRowid);

  const playlistDir = getPlaylistDir(playlistId);
  await fs.promises.mkdir(playlistDir, { recursive: true });

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO tracks (
      file_path, file_hash, file_size, file_mtime,
      title, artist, album, album_artist,
      track_number, disc_number, duration_ms,
      genre, year, bitrate, sample_rate, format,
      cover_art_path, in_library
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const imported: ImportedPlaylistTrack[] = [];

  for (const sourceFile of sourceFiles) {
    const playlistPath = await findNonCollidingFileAsync(playlistDir, path.basename(sourceFile));
    await fs.promises.copyFile(sourceFile, playlistPath);

    const stats = await getFileStatsAsync(sourceFile);
    if (!stats) {
      continue;
    }

    const meta = await readTrackMetadata(sourceFile, stats.size);
    await applySavedMetadata(meta, sourceFile, tracksMeta, artworkMap);

    if (skipExisting && meta.file_hash && existingHashes.has(meta.file_hash)) {
      const existing = db
        .prepare('SELECT id FROM tracks WHERE file_hash = ? LIMIT 1')
        .get(meta.file_hash) as { id: number } | undefined;
      if (existing) {
        imported.push({ trackId: existing.id, playlistPath });
      }
      continue;
    }

    const result = insertStmt.run(
      playlistPath,
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
    );

    let trackId: number;
    if (result.changes > 0) {
      trackId = Number(result.lastInsertRowid);
      if (meta.file_hash) {
        existingHashes.add(meta.file_hash);
      }
    } else {
      const existing = db
        .prepare('SELECT id FROM tracks WHERE file_path = ?')
        .get(playlistPath) as { id: number } | undefined;
      if (!existing) {
        continue;
      }
      trackId = existing.id;
    }

    imported.push({ trackId, playlistPath });
  }

  attachImportedTracks(db, playlistId, imported);
  syncPlaylistCover(db, playlistId, coverPath, imported);
  scheduleImportedTrackLoudness(db, imported);

  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId) as Playlist;
}
