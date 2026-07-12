/**
 * Shared helpers for playlist import/export operations.
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import archiver from 'archiver';
import { analyzeLoudness } from '../services/loudness-analyzer';
import type { getDb } from '../services/database';

export type TrackMetaEntry = {
  title: string | null;
  artist: string | null;
  album: string | null;
  artwork: string | null;
  position?: number;
};

export const ZIP_EXTENSIONS = ['.zip'];

const COVER_NAMES = ['cover', 'folder', 'album', 'front', 'artwork', 'thumb'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

/** Create a .zip archive from a staging directory (preserves subdirectories). */
export function createZipFromDir(stagingDir: string, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(stagingDir, false);
    archive.finalize();
  });
}

/** Copy a file to the artwork directory. Returns the destination path. */
export async function copyToArtwork(src: string, baseName: string): Promise<string> {
  const artworkDir = path.join(app.getPath('userData'), 'artwork');
  await fs.promises.mkdir(artworkDir, { recursive: true });
  const dest = path.join(artworkDir, `${baseName}${path.extname(src)}`);
  try {
    await fs.promises.access(dest);
  } catch {
    await fs.promises.copyFile(src, dest);
  }
  return dest;
}

/** Look for cover.jpg, folder.png, etc. in a directory. Copy to artwork dir if found. */
export async function findDirectoryCover(dir: string, fileHash: string | null): Promise<string | null> {
  try {
    const entries = await fs.promises.readdir(dir);
    for (const name of COVER_NAMES) {
      for (const ext of IMAGE_EXTS) {
        const candidate = entries.find(
          (e) => e.toLowerCase() === `${name}${ext}`,
        );
        if (candidate) {
          const src = path.join(dir, candidate);
          const label = fileHash || `dir-${Date.now()}`;
          return copyToArtwork(src, `dircover-${label}`);
        }
      }
    }
    const anyImage = entries.find((e) =>
      IMAGE_EXTS.includes(path.extname(e).toLowerCase()),
    );
    if (anyImage) {
      const src = path.join(dir, anyImage);
      const label = fileHash || `dir-${Date.now()}`;
      return copyToArtwork(src, `dircover-${label}`);
    }
  } catch { /* ignore */ }
  return null;
}

/** Analyze loudness for a batch of track IDs (background, non-blocking). */
export async function analyzeLoudnessBatch(
  trackIds: number[],
  ffmpegPath: string,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  const selectStmt = db.prepare('SELECT file_path FROM tracks WHERE id = ?');
  const updateStmt = db.prepare(
    'UPDATE tracks SET loudness_lufs = ?, loudness_gain = ? WHERE id = ?',
  );

  for (const id of trackIds) {
    try {
      const row = selectStmt.get(id) as { file_path: string } | undefined;
      if (!row) continue;
      const result = await analyzeLoudness(row.file_path, ffmpegPath);
      if (result) {
        updateStmt.run(result.lufs, result.gain, id);
      }
    } catch {
      // Non-blocking
    }
  }
}
