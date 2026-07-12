import { app } from 'electron';
import path from 'path';
import type { ExportManifest } from '@ton/core';
import {
  cleanupImportTempDir,
  extractImportBundle,
  insertImportedLibrary,
  loadExistingTrackHashes,
  loadImportManifest,
  resolveImportDownloadDir,
} from './import-data';
import { getArtworkDir } from '../../services/metadata-reader/artwork';
import { measurePerfAsync } from '../../services/perf';
import { copyImportDataOffthread } from '../../services/export-import-offload';
import type { ProgressPayload } from './types';

export type RunLibraryImportResult = {
  manifest: ExportManifest;
  importedTracks: number;
  skippedTracks: number;
  importedPlaylists: number;
  playlistIds: number[];
};

export async function runLibraryImportBundle(
  bundlePath: string,
  sendProgress: (data: ProgressPayload) => void,
): Promise<RunLibraryImportResult> {
  const tempDir = path.join(app.getPath('temp'), `ton-import-${Date.now()}`);

  try {
    sendProgress({ phase: 'extract', current: 0, total: 1 });
    const bundleDir = await extractImportBundle(bundlePath, tempDir);
    const manifest = await loadImportManifest(bundleDir);
    const downloadDir = await resolveImportDownloadDir();
    const artworkDir = getArtworkDir();
    const existingHashes = loadExistingTrackHashes();
    const {
      filesToInsert,
      importedTracks,
      playlistCoverPaths,
      skippedTracks,
    } = await measurePerfAsync(
      'import:copy-data',
      () =>
        copyImportDataOffthread(
          manifest,
          bundleDir,
          downloadDir,
          artworkDir,
          existingHashes,
          sendProgress,
        ),
    );
    const { importedPlaylists, playlistIds } = insertImportedLibrary(
      manifest,
      filesToInsert,
      playlistCoverPaths,
      sendProgress,
    );

    sendProgress({ phase: 'done', current: 1, total: 1 });

    return {
      manifest,
      importedTracks,
      skippedTracks,
      importedPlaylists,
      playlistIds,
    };
  } finally {
    cleanupImportTempDir(tempDir);
  }
}
