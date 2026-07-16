import { BrowserWindow, dialog } from 'electron';
import { SUPPORTED_AUDIO_EXTENSIONS } from '@ton/core';
import { getDb } from '../../services/database';
import { getLibraryDir, ensureInLibraryAsync } from '../../services/library-paths';
import { getFileStatsAsync } from '../../services/file-scanner';
import { readTrackMetadataOffthread } from '../../services/metadata-reader';
import { scheduleLibraryLoudnessAnalysis } from './loudness';
import {
  createMarkTrackImportedStatement,
  getCurrentImportTimestamp,
} from '../../services/library-import-timestamp';
import {
  buildTrackInsertParams,
  createEnsureInLibraryStatement,
  createLibraryTrackInsertStatement,
  getExistingTrackByPath,
} from './track-db';
import type { LibraryImportFilesResult } from './types';

async function pickAudioFilePaths(): Promise<string[]> {
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

export async function handleLibraryImportFiles(): Promise<LibraryImportFilesResult> {
  const filePaths = await pickAudioFilePaths();
  if (filePaths.length === 0) return { imported: 0 };

  const db = getDb();
  const libraryDir = getLibraryDir();
  const insertStmt = createLibraryTrackInsertStatement(db, { ignoreDuplicates: true });
  const ensureLibraryStmt = createEnsureInLibraryStatement(db);
  const markImportedStmt = createMarkTrackImportedStatement(db);
  const importedAt = getCurrentImportTimestamp();

  const insertedIds: number[] = [];
  let imported = 0;

  for (const filePath of filePaths) {
    const stats = await getFileStatsAsync(filePath);
    if (!stats) continue;

    const meta = await readTrackMetadataOffthread(filePath, stats.size);
    const libraryPath = await ensureInLibraryAsync(filePath, libraryDir);
    const result = insertStmt.run(...buildTrackInsertParams(libraryPath, stats, meta));

    let trackId: number;
    if (result.changes > 0) {
      trackId = Number(result.lastInsertRowid);
    } else {
      const existing = getExistingTrackByPath(db, libraryPath);
      if (!existing) continue;
      trackId = existing.id;
      if (!existing.in_library) {
        ensureLibraryStmt.run(trackId);
      }
    }

    markImportedStmt.run(importedAt, trackId);
    insertedIds.push(trackId);
    imported++;
  }

  scheduleLibraryLoudnessAnalysis(insertedIds);
  return { imported };
}
