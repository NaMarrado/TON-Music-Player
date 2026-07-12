import fs from 'node:fs';
import { BrowserWindow } from 'electron';
import os from 'os';
import type { ExportManifest } from '@ton/core';
import { measurePerfAsync } from '../../services/perf';
import {
  createExportArchiveOffthread,
  createExportFolderOffthread,
} from '../../services/export-import-offload';
import {
  getExportSummary,
  loadExportBundleData,
  loadExportSourcePaths,
  loadExportSummary,
} from './export-data';
import { runAtomicExport } from './atomic-export';
import { pickExportDestination } from './dialogs';
import { ensureExportSourcesReadable } from './export-source-access';
import { createProgressSender } from './progress';
import type { ExportResult, ExportStartOptions, ExportSummaryResult } from './types';

async function sumFileSizes(filePaths: string[]): Promise<number> {
  const sizes = await Promise.all(filePaths.map(async (filePath) => {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }));

  return sizes.reduce((sum, size) => sum + size, 0);
}

function resolveEventWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  try {
    return BrowserWindow.fromWebContents(event.sender);
  } catch {
    return null;
  }
}

export async function startLibraryExport(
  event: Electron.IpcMainInvokeEvent,
  options?: ExportStartOptions,
): Promise<ExportResult> {
  const win = resolveEventWindow(event);
  await ensureExportSourcesReadable(win, loadExportSourcePaths(options));
  const {
    libraryTrackHashes,
    trackEntries,
    playlistEntries,
    trackFiles,
    artworkFiles,
  } = await loadExportBundleData(options);
  const summary = getExportSummary({ trackEntries, playlistEntries });

  if (summary.exportableTrackCount === 0 && summary.exportablePlaylistCount === 0) {
    return { trackCount: 0, playlistCount: 0, sizeBytes: 0 };
  }

  const destination = await pickExportDestination(
    win,
    options?.destinationPath,
    options?.bundleFormat,
  );

  if (!destination) {
    return { trackCount: 0, playlistCount: 0, sizeBytes: 0 };
  }

  const sendProgress = createProgressSender(event.sender, 'export:progress');
  const bundleType: ExportManifest['bundle_type'] = options?.includeLibrary === false ? 'playlist' : 'library';
  const totalTrackSizeBytes = await sumFileSizes([
    ...trackFiles.map((trackFile) => trackFile.filePath),
    ...artworkFiles.map((artworkFile) => artworkFile.filePath),
  ]);

  const manifest: ExportManifest = {
    version: 1,
    bundle_type: bundleType,
    created_at: Date.now(),
    device_name: os.hostname(),
    track_count: trackEntries.length,
    playlist_count: playlistEntries.length,
    total_size_bytes: totalTrackSizeBytes,
    library_track_hashes: libraryTrackHashes,
    tracks: trackEntries,
    playlists: playlistEntries,
  };

  return runAtomicExport(
    destination.destinationPath,
    destination.bundleFormat,
    (stagingPath) => destination.bundleFormat === 'folder'
      ? measurePerfAsync('export:create-folder', () =>
        createExportFolderOffthread(
          stagingPath,
          manifest,
          trackFiles,
          artworkFiles,
          sendProgress,
        ))
      : measurePerfAsync('export:create-archive', () =>
        createExportArchiveOffthread(
          stagingPath,
          manifest,
          trackFiles,
          artworkFiles,
          sendProgress,
        )),
  );
}

export async function getLibraryExportSummary(
  _event: Electron.IpcMainInvokeEvent,
  options?: ExportStartOptions,
): Promise<ExportSummaryResult> {
  return loadExportSummary(options);
}
