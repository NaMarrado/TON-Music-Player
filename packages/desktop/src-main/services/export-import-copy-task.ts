import fs from 'node:fs';
import path from 'node:path';
import type { ExportManifest } from '@ton/core';
import type { ProgressPayload } from '../handlers/export-import-handler/types';
import type { ImportCopyResult } from './export-import-offload-types';
import { pathExists, sanitizeTrackFileName } from './export-import-offload-worker-shared';

export async function copyImportData(
  manifest: ExportManifest,
  tempDir: string,
  downloadDir: string,
  artworkDir: string,
  existingHashes: string[],
  onProgress: (payload: ProgressPayload) => void,
): Promise<ImportCopyResult> {
  await fs.promises.mkdir(downloadDir, { recursive: true });
  await fs.promises.mkdir(artworkDir, { recursive: true });

  const filesToInsert: ImportCopyResult['filesToInsert'] = [];
  const knownHashes = new Set(existingHashes);
  let importedTracks = 0;
  let skippedTracks = 0;

  onProgress({ phase: 'tracks', current: 0, total: manifest.tracks.length });

  for (let index = 0; index < manifest.tracks.length; index += 1) {
    const entry = manifest.tracks[index];

    if (knownHashes.has(entry.file_hash)) {
      skippedTracks += 1;
      onProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const sourcePath = path.join(tempDir, entry.relative_path);
    if (!(await pathExists(sourcePath))) {
      skippedTracks += 1;
      onProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const ext = path.extname(entry.relative_path);
    let fileName = sanitizeTrackFileName(entry, ext);
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
    knownHashes.add(entry.file_hash);
    importedTracks += 1;
    onProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
  }

  const extractedArtworkDir = path.join(tempDir, 'artwork');
  if (await pathExists(extractedArtworkDir)) {
    const artFiles = await fs.promises.readdir(extractedArtworkDir);
    onProgress({ phase: 'artwork', current: 0, total: artFiles.length });
    for (let index = 0; index < artFiles.length; index += 1) {
      const artFile = artFiles[index];
      const sourcePath = path.join(extractedArtworkDir, artFile);
      const destinationPath = path.join(artworkDir, artFile);
      if (!(await pathExists(destinationPath))) {
        await fs.promises.copyFile(sourcePath, destinationPath);
      }
      onProgress({ phase: 'artwork', current: index + 1, total: artFiles.length });
    }
  }

  return { filesToInsert, importedTracks, skippedTracks };
}
