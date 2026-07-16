import { BrowserWindow, dialog } from 'electron';
import { SUPPORTED_AUDIO_EXTENSIONS } from '@ton/core';
import { getDb } from '../../services/database';
import { getFfmpegPathAsync } from '../../services/binary-manager';
import { getFileStatsAsync } from '../../services/file-scanner';
import { getLibraryDir, ensureInLibraryAsync } from '../../services/library-paths';
import { readTrackMetadata } from '../../services/metadata-reader';
import { analyzeLoudnessBatch } from '../playlist-helpers';
import type { ImportedPlaylistTrack } from './types';
import {
  createMarkTrackImportedStatement,
  getCurrentImportTimestamp,
} from '../../services/library-import-timestamp';

async function pickAudioFiles(): Promise<string[]> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return [];

  const extensions = (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).map((ext) => ext.slice(1));
  const result = await dialog.showOpenDialog(win, {
    title: 'Import audio files',
    filters: [{ name: 'Audio', extensions: [...extensions] }],
    properties: ['openFile', 'multiSelections'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  return result.filePaths;
}

export async function handleImportFiles(playlistId: number): Promise<{ imported: number }> {
  const filePaths = await pickAudioFiles();
  if (filePaths.length === 0) return { imported: 0 };

  const db = getDb();
  const libraryDir = getLibraryDir();
  const markImportedStmt = createMarkTrackImportedStatement(db);
  const importedAt = getCurrentImportTimestamp();

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO tracks (
      file_path, file_hash, file_size, file_mtime,
      title, artist, album, album_artist,
      track_number, disc_number, duration_ms,
      genre, year, bitrate, sample_rate, format,
      cover_art_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const imported: ImportedPlaylistTrack[] = [];

  for (const filePath of filePaths) {
    const stats = await getFileStatsAsync(filePath);
    if (!stats) continue;

    const libraryPath = await ensureInLibraryAsync(filePath, libraryDir);
    const meta = await readTrackMetadata(libraryPath, stats.size);

    const result = insertStmt.run(
      libraryPath,
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
    } else {
      const existing = db
        .prepare('SELECT id FROM tracks WHERE file_path = ?')
        .get(libraryPath) as { id: number } | undefined;
      if (!existing) continue;
      trackId = existing.id;
    }

    markImportedStmt.run(importedAt, trackId);
    imported.push({ trackId });
  }

  if (imported.length > 0) {
    const maxRow = db
      .prepare('SELECT MAX(position) as maxPos FROM playlist_tracks WHERE playlist_id = ?')
      .get(playlistId) as { maxPos: number | null } | undefined;
    let nextPosition = (maxRow?.maxPos ?? -1) + 1;

    const addStmt = db.prepare(
      'INSERT INTO playlist_tracks (playlist_id, track_id, position, file_path) VALUES (?, ?, ?, NULL)',
    );

    db.transaction(() => {
      for (const entry of imported) {
        addStmt.run(playlistId, entry.trackId, nextPosition++);
      }
    })();

    db.prepare("UPDATE playlists SET updated_at = strftime('%s','now') WHERE id = ?").run(
      playlistId,
    );
  }

  const ffmpegPath = await getFfmpegPathAsync();
  const trackIds = imported.map((entry) => entry.trackId);
  if (ffmpegPath && trackIds.length > 0) {
    void analyzeLoudnessBatch(trackIds, ffmpegPath, db);
  }

  return { imported: imported.length };
}
