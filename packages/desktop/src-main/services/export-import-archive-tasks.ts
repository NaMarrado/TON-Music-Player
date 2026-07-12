import fs, { createWriteStream } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import type { ExportManifest } from '@ton/core';
import type {
  ExportResult,
  PreparedArtworkFile,
  PreparedTrackFile,
  ProgressPayload,
} from '../handlers/export-import-handler/types';

export function createExportArchive(
  destinationPath: string,
  manifest: ExportManifest,
  trackFiles: PreparedTrackFile[],
  artworkFiles: PreparedArtworkFile[],
  onProgress: (payload: ProgressPayload) => void,
): Promise<ExportResult> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destinationPath);
    const archive = archiver('zip', { store: true });

    output.on('close', () => {
      resolve({
        trackCount: manifest.tracks.length,
        playlistCount: manifest.playlists.length,
        sizeBytes: archive.pointer(),
      });
    });
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    onProgress({ phase: 'manifest', current: 0, total: trackFiles.length });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    const totalFiles = trackFiles.length + artworkFiles.length;
    let processed = 0;

    for (const trackFile of trackFiles) {
      archive.file(trackFile.filePath, { name: trackFile.archivePath });
      processed += 1;
      onProgress({ phase: 'tracks', current: processed, total: totalFiles });
    }

    for (const artworkFile of artworkFiles) {
      archive.file(artworkFile.filePath, { name: artworkFile.archivePath });
      processed += 1;
      onProgress({ phase: 'artwork', current: processed, total: totalFiles });
    }

    onProgress({ phase: 'done', current: totalFiles, total: totalFiles });
    void archive.finalize();
  });
}

export async function createExportFolder(
  destinationPath: string,
  manifest: ExportManifest,
  trackFiles: PreparedTrackFile[],
  artworkFiles: PreparedArtworkFile[],
  onProgress: (payload: ProgressPayload) => void,
): Promise<ExportResult> {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.promises.mkdir(destinationPath);

  const manifestPayload = `${JSON.stringify(manifest, null, 2)}\n`;
  await fs.promises.writeFile(path.join(destinationPath, 'manifest.json'), manifestPayload, 'utf-8');
  onProgress({ phase: 'manifest', current: 1, total: 1 });

  const totalFiles = trackFiles.length + artworkFiles.length;
  let processed = 0;
  let sizeBytes = Buffer.byteLength(manifestPayload);

  for (const trackFile of trackFiles) {
    const targetPath = path.join(destinationPath, trackFile.archivePath);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.copyFile(trackFile.filePath, targetPath);
    const stats = await fs.promises.stat(trackFile.filePath);
    sizeBytes += stats.size;
    processed += 1;
    onProgress({ phase: 'tracks', current: processed, total: totalFiles });
  }

  for (const artworkFile of artworkFiles) {
    const targetPath = path.join(destinationPath, artworkFile.archivePath);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.copyFile(artworkFile.filePath, targetPath);
    const stats = await fs.promises.stat(artworkFile.filePath);
    sizeBytes += stats.size;
    processed += 1;
    onProgress({ phase: 'artwork', current: processed, total: totalFiles });
  }

  onProgress({ phase: 'done', current: totalFiles, total: totalFiles });

  return {
    trackCount: manifest.tracks.length,
    playlistCount: manifest.playlists.length,
    sizeBytes,
  };
}
