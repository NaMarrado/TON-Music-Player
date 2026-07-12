/**
 * Library Paths - shared utilities for library and playlist directory management.
 *
 * Audio is stored once in the canonical Library directory. Playlists only
 * reference Library tracks in the database.
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getDb } from './database';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Get the library directory (where all library music files live). */
export function getLibraryDir(): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('download_directory') as
    | { value: string }
    | undefined;
  let dir = row?.value || '';
  if (!dir) {
    dir = path.join(app.getPath('music'), 'TON');
  }
  return dir;
}

/** Get the folder for a specific playlist's file copies. */
export function getPlaylistDir(playlistId: number): string {
  return path.join(getLibraryDir(), 'Playlists', String(playlistId));
}

export async function findNonCollidingFileAsync(dir: string, baseName: string): Promise<string> {
  await fs.promises.mkdir(dir, { recursive: true });
  let dest = path.join(dir, baseName);
  if (!(await pathExists(dest))) {
    return dest;
  }

  const ext = path.extname(baseName);
  const stem = path.basename(baseName, ext);
  let i = 2;

  while (await pathExists(path.join(dir, `${stem} (${i})${ext}`))) {
    i += 1;
  }

  return path.join(dir, `${stem} (${i})${ext}`);
}

export async function ensureInLibraryAsync(srcFile: string, libraryDir: string): Promise<string> {
  const resolved = path.resolve(srcFile);
  const resolvedLib = path.resolve(libraryDir);
  if (resolved.startsWith(resolvedLib + path.sep) || resolved === resolvedLib) {
    return srcFile;
  }

  const dest = await findNonCollidingFileAsync(libraryDir, path.basename(srcFile));
  await fs.promises.copyFile(srcFile, dest);
  return dest;
}
