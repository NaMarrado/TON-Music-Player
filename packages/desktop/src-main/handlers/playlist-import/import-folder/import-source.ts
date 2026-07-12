import fs from 'fs';
import path from 'path';
import type { Playlist } from '@ton/core';
import { getDb } from '../../../services/database';
import { scanDirectoryOffthread } from '../../../services/file-scanner';
import { ZIP_EXTENSIONS } from '../../playlist-helpers';
import { runLibraryImportBundle } from '../../export-import-handler/import-runner';
import { readExportedMetadata } from '../exported-metadata';
import { importFolderTracks } from './folder-tracks';
import { importFromZip } from './zip-import';

export async function handleImportFolder(
  inputPath: string,
  skipExisting: boolean,
): Promise<Playlist | { empty: true } | null> {
  return importFromPath(inputPath, skipExisting);
}

async function tryImportTonBundle(inputPath: string): Promise<Playlist | null | undefined> {
  try {
    const result = await runLibraryImportBundle(inputPath, () => {});
    if (result.playlistIds.length === 0) {
      throw new Error('Selected TON bundle does not contain any playlists');
    }

    const db = getDb();
    return db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.playlistIds[0]) as Playlist | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Invalid TON library bundle:')) {
      return undefined;
    }
    throw error;
  }
}

async function importFromPath(
  inputPath: string,
  skipExisting = false,
): Promise<Playlist | { empty: true } | null> {
  const tonBundleResult = await tryImportTonBundle(inputPath);
  if (tonBundleResult !== undefined) {
    return tonBundleResult;
  }

  const stat = await fs.promises.stat(inputPath);

  if (stat.isDirectory()) {
    const { playlistName, coverPath, tracksMeta, artworkMap } = await readExportedMetadata(
      inputPath,
      path.basename(inputPath),
    );
    const files = await scanDirectoryOffthread(inputPath);
    if (files.length === 0) {
      return { empty: true };
    }

    return importFolderTracks(
      playlistName,
      files,
      coverPath,
      tracksMeta,
      artworkMap,
      skipExisting,
    );
  }

  if (ZIP_EXTENSIONS.includes(path.extname(inputPath).toLowerCase())) {
    return importFromZip(inputPath, skipExisting);
  }

  return null;
}
