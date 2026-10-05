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

/** A bundle unpacked into a temporary folder (or a bundle folder used in place), with its manifest read. */
export type OpenedImportBundle = {
  tempDir: string;
  bundleDir: string;
  manifest: ExportManifest;
};

export async function openImportBundle(bundlePath: string, sendProgress: (data: ProgressPayload) => void): Promise<OpenedImportBundle> {
  const tempDir = path.join(app.getPath('temp'), `ton-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    sendProgress({ phase: 'extract', current: 0, total: 1 });
    const bundleDir = await extractImportBundle(bundlePath, tempDir);
    return { tempDir, bundleDir, manifest: await loadImportManifest(bundleDir) };
  } catch (error) {
    cleanupImportTempDir(tempDir);
    throw error;
  }
}

/** Copies the songs of `manifest` out of an opened bundle and adds them and its playlists to the database. */
export async function importOpenedBundle(
  opened: OpenedImportBundle,
  manifest: ExportManifest,
  sendProgress: (data: ProgressPayload) => void,
): Promise<RunLibraryImportResult> {
  const downloadDir = await resolveImportDownloadDir();
  const { filesToInsert, importedTracks, playlistCoverPaths, skippedTracks } = await measurePerfAsync(
    'import:copy-data',
    () => copyImportDataOffthread(manifest, opened.bundleDir, downloadDir, getArtworkDir(), loadExistingTrackHashes(), sendProgress),
  );
  const { importedPlaylists, playlistIds } = insertImportedLibrary(manifest, filesToInsert, playlistCoverPaths, sendProgress);
  sendProgress({ phase: 'done', current: 1, total: 1 });
  return { manifest, importedTracks, skippedTracks, importedPlaylists, playlistIds };
}

export async function runLibraryImportBundle(
  bundlePath: string,
  sendProgress: (data: ProgressPayload) => void,
): Promise<RunLibraryImportResult> {
  const opened = await openImportBundle(bundlePath, sendProgress);
  try {
    return await importOpenedBundle(opened, opened.manifest, sendProgress);
  } finally {
    cleanupImportTempDir(opened.tempDir);
  }
}
