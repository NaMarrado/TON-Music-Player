import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import type { ExportManifest } from '@ton/core';
import { getDb } from '../../../services/database';
import type {
  CopyImportTracksResult,
  ImportPreparedFile,
  ProgressPayload,
} from '../types';

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveImportDownloadDir(): Promise<string> {
  const db = getDb();
  const dirSetting = db.prepare("SELECT value FROM settings WHERE key = 'download_directory'")
    .get() as { value: string } | undefined;

  const downloadDir = dirSetting?.value
    ? dirSetting.value
    : path.join(app.getPath('music'), 'TON');

  await fs.promises.mkdir(downloadDir, { recursive: true });
  return downloadDir;
}

export function loadExistingTrackHashes(): Set<string> {
  const db = getDb();
  const existingHashes = new Set<string>();
  const hashRows = db.prepare('SELECT file_hash FROM tracks WHERE file_hash IS NOT NULL')
    .all() as Array<{ file_hash: string }>;

  for (const row of hashRows) {
    existingHashes.add(row.file_hash);
  }

  return existingHashes;
}

export async function copyImportTracks(
  manifest: ExportManifest,
  tempDir: string,
  downloadDir: string,
  existingHashes: Set<string>,
  sendProgress: (data: ProgressPayload) => void,
): Promise<CopyImportTracksResult> {
  const filesToInsert: ImportPreparedFile[] = [];
  let importedTracks = 0;
  let skippedTracks = 0;

  sendProgress({ phase: 'tracks', current: 0, total: manifest.tracks.length });

  for (let index = 0; index < manifest.tracks.length; index += 1) {
    const entry = manifest.tracks[index];

    if (existingHashes.has(entry.file_hash)) {
      skippedTracks += 1;
      sendProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const sourcePath = path.join(tempDir, entry.relative_path);
    if (!(await pathExists(sourcePath))) {
      skippedTracks += 1;
      sendProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const ext = path.extname(entry.relative_path);
    let fileName = `${entry.metadata.artist || 'Unknown'} - ${entry.metadata.title || 'Untitled'}${ext}`
      .replace(/[<>:"/\\|?*]/g, '_');

    let destinationPath = path.join(downloadDir, fileName);
    if (await pathExists(destinationPath)) {
      const baseName = path.basename(fileName, ext);
      fileName = `${baseName}_${entry.file_hash.slice(0, 8)}${ext}`;
      destinationPath = path.join(downloadDir, fileName);
    }

    await fs.promises.copyFile(sourcePath, destinationPath);
    filesToInsert.push({
      destPath: destinationPath,
      hash: entry.file_hash,
      meta: entry.metadata,
    });
    existingHashes.add(entry.file_hash);
    importedTracks += 1;
    sendProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
  }

  return { filesToInsert, importedTracks, skippedTracks };
}

export async function copyImportArtwork(tempDir: string): Promise<void> {
  const artworkDir = path.join(app.getPath('userData'), 'artwork');
  const extractedArtworkDir = path.join(tempDir, 'artwork');

  if (!(await pathExists(extractedArtworkDir))) {
    return;
  }

  await fs.promises.mkdir(artworkDir, { recursive: true });
  const artFiles = await fs.promises.readdir(extractedArtworkDir);

  for (const artFile of artFiles) {
    const src = path.join(extractedArtworkDir, artFile);
    const dest = path.join(artworkDir, artFile);
    if (!(await pathExists(dest))) {
      await fs.promises.copyFile(src, dest);
    }
  }
}
