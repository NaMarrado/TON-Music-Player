import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import { getDb } from '../../../services/database';
import { getLibraryDir } from '../../../services/library-paths';
import { getFileStatsAsync, scanDirectoryOffthread } from '../../../services/file-scanner';
import { readTrackMetadataOffthread } from '../../../services/metadata-reader';
import { scheduleLibraryLoudnessAnalysis } from '../loudness';
import { createScanProgressSender } from '../progress';
import {
  buildTrackInsertParams,
  createLibraryTrackInsertStatement,
  getExistingTrackState,
  type TrackInsertParams,
} from '../track-db';
import type { LibraryScanResult } from '../types';
import { pickScanDirectory } from './directory-picker';
import { copyIntoLibraryIfNeeded } from './library-copy';

const BATCH_SIZE = 50;

export async function handleLibraryScan(
  event: IpcMainInvokeEvent,
  dirPath?: string,
): Promise<LibraryScanResult> {
  const targetDir = dirPath ?? (await pickScanDirectory(event));
  if (!targetDir) {
    return { imported: 0, skipped: 0 };
  }

  const sendProgress = createScanProgressSender(event);
  sendProgress({
    phase: 'scanning',
    found: 0,
    processed: 0,
    total: 0,
    currentFile: targetDir,
  });

  const files = await scanDirectoryOffthread(targetDir);
  if (files.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  const db = getDb();
  const libraryDir = getLibraryDir();
  const resolvedLibraryDir = `${path.resolve(libraryDir)}${path.sep}`;
  const { existingPaths, existingHashes } = getExistingTrackState(db);
  const newFiles = files.filter((filePath) => !existingPaths.has(filePath));
  let skipped = files.length - newFiles.length;

  if (newFiles.length === 0) {
    return { imported: 0, skipped };
  }

  const insertStmt = createLibraryTrackInsertStatement(db);
  const insertedIds: number[] = [];
  const insertBatch = db.transaction((paramsList: TrackInsertParams[]) => {
    for (const params of paramsList) {
      const result = insertStmt.run(...params);
      insertedIds.push(Number(result.lastInsertRowid));
    }
  });

  let imported = 0;
  let batch: TrackInsertParams[] = [];

  for (let index = 0; index < newFiles.length; index += 1) {
    const filePath = newFiles[index];

    sendProgress({
      phase: 'reading',
      found: files.length,
      processed: index,
      total: newFiles.length,
      currentFile: filePath,
    });

    const stats = await getFileStatsAsync(filePath);
    if (!stats) {
      continue;
    }

    const meta = await readTrackMetadataOffthread(filePath, stats.size);

    if (meta.file_hash && existingHashes.has(meta.file_hash)) {
      skipped += 1;
      continue;
    }

    if (meta.file_hash) {
      existingHashes.add(meta.file_hash);
    }

    const libraryPath = await copyIntoLibraryIfNeeded(filePath, libraryDir, resolvedLibraryDir);
    batch.push(buildTrackInsertParams(libraryPath, stats, meta));

    if (batch.length >= BATCH_SIZE) {
      sendProgress({
        phase: 'importing',
        found: files.length,
        processed: index + 1,
        total: newFiles.length,
        currentFile: filePath,
      });
      insertBatch(batch);
      imported += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    insertBatch(batch);
    imported += batch.length;
  }

  sendProgress({
    phase: 'importing',
    found: files.length,
    processed: newFiles.length,
    total: newFiles.length,
    currentFile: '',
  });

  scheduleLibraryLoudnessAnalysis(insertedIds);
  return { imported, skipped };
}
