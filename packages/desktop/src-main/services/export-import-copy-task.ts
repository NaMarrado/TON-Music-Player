import fs from 'node:fs';
import path from 'node:path';
import type { ExportManifest } from '@ton/core';
import type { ProgressPayload } from '../handlers/export-import-handler/types';
import { hashFileSha256 } from './cloud-sync/hash';
import type { ImportCopyResult } from './export-import-offload-types';
import { pathExists, sanitizeTrackFileName } from './export-import-offload-worker-shared';

function resolveContainedPath(rootDir: string, relativePath: string): string | null {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
    ? resolved
    : null;
}

function sanitizeArtworkStem(relativePath: string, ext: string): string {
  const stem = path.basename(relativePath, ext)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim();
  return stem || 'playlist-cover';
}

function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

async function resolveArtworkDestination(
  artworkDir: string,
  relativePath: string,
  contentHash: string,
): Promise<{ destinationPath: string; alreadyExists: boolean }> {
  const ext = path.extname(relativePath) || '.jpg';
  const stem = sanitizeArtworkStem(relativePath, ext);
  const hashSuffix = contentHash.slice(0, 12);
  let index = 1;

  while (true) {
    const suffix = index === 1 ? hashSuffix : `${hashSuffix}_${index}`;
    const destinationPath = path.join(artworkDir, `${stem}_${suffix}${ext}`);
    if (!(await pathExists(destinationPath))) {
      return { destinationPath, alreadyExists: false };
    }

    try {
      if ((await hashFileSha256(destinationPath)) === contentHash) {
        return { destinationPath, alreadyExists: true };
      }
    } catch {
      // Keep an unreadable existing file untouched and choose another destination.
    }
    index += 1;
  }
}

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
  const playlistCoverPaths: Record<string, string> = {};
  const knownHashes = new Set(existingHashes);
  let importedTracks = 0;
  let skippedTracks = 0;

  onProgress({ phase: 'tracks', current: 0, total: manifest.tracks.length });

  for (let index = 0; index < manifest.tracks.length; index += 1) {
    const entry = manifest.tracks[index];

    if (
      knownHashes.has(entry.file_hash)
      || (entry.content_hash_sha256 && knownHashes.has(entry.content_hash_sha256))
    ) {
      skippedTracks += 1;
      onProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const sourcePath = resolveContainedPath(tempDir, entry.relative_path);
    if (!sourcePath || !(await pathExists(sourcePath))) {
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
    const destinationStats = await fs.promises.stat(destinationPath);
    filesToInsert.push({
      destPath: destinationPath,
      hash: entry.file_hash,
      contentHashSha256: entry.content_hash_sha256 ?? null,
      downloadedAt: normalizeDownloadedAt(entry.downloaded_at),
      fileSize: destinationStats.size,
      meta: entry.metadata,
    });
    knownHashes.add(entry.file_hash);
    if (entry.content_hash_sha256) knownHashes.add(entry.content_hash_sha256);
    importedTracks += 1;
    onProgress({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
  }

  const artworkPaths = [...new Set(
    manifest.playlists
      .map((playlist) => playlist.cover_relative_path ?? null)
      .filter((value): value is string => Boolean(value)),
  )];
  onProgress({ phase: 'artwork', current: 0, total: artworkPaths.length });
  for (let index = 0; index < artworkPaths.length; index += 1) {
    const relativePath = artworkPaths[index];
    const sourcePath = resolveContainedPath(tempDir, relativePath);
    if (sourcePath && await pathExists(sourcePath)) {
      const contentHash = await hashFileSha256(sourcePath);
      const destination = await resolveArtworkDestination(
        artworkDir,
        relativePath,
        contentHash,
      );
      if (!destination.alreadyExists) {
        await fs.promises.copyFile(sourcePath, destination.destinationPath);
      }
      playlistCoverPaths[relativePath] = destination.destinationPath;
    }
    onProgress({ phase: 'artwork', current: index + 1, total: artworkPaths.length });
  }

  return { filesToInsert, importedTracks, playlistCoverPaths, skippedTracks };
}
