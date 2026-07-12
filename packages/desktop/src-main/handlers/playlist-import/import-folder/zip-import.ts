import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Playlist } from '@ton/core';
import { scanDirectoryOffthread } from '../../../services/file-scanner';
import { readExportedMetadata } from '../exported-metadata';
import { extractZipArchive } from '../zip';
import { importFolderTracks } from './folder-tracks';

async function cleanupExtractedMetadata(tempDir: string): Promise<void> {
  for (const metaFile of ['_playlist.json', '_tracks.json']) {
    const metaPath = path.join(tempDir, metaFile);
    await fs.promises.rm(metaPath, { force: true }).catch(() => {});
  }

  for (const entry of await fs.promises.readdir(tempDir)) {
    if (!entry.startsWith('_art_')) {
      continue;
    }

    try {
      await fs.promises.unlink(path.join(tempDir, entry));
    } catch {
      // Best-effort cleanup of legacy artwork files.
    }
  }
}

export async function importFromZip(
  zipPath: string,
  skipExisting = false,
): Promise<Playlist | { empty: true } | null> {
  const ext = path.extname(zipPath).toLowerCase();
  const archiveName = path.basename(zipPath, ext);
  const tempDir = path.join(os.tmpdir(), `ton-import-${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });

  try {
    await extractZipArchive(zipPath, tempDir);
  } catch {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new Error('Invalid or corrupted playlist archive');
  }

  try {
    const { playlistName, coverPath, tracksMeta, artworkMap } = await readExportedMetadata(
      tempDir,
      archiveName,
    );
    await cleanupExtractedMetadata(tempDir);

    const files = await scanDirectoryOffthread(tempDir);
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
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
