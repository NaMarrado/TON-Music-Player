import fs from 'fs';
import path from 'path';
import { sanitizeFilename } from '@ton/core';
import { getLibraryDir } from '../library-paths';

export const getDownloadDir = getLibraryDir;

export function buildSafeOutputTitle(title: string): string {
  return sanitizeFilename(title);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findOutputFile(dir: string, baseName: string): Promise<string | null> {
  const safeBaseName = sanitizeFilename(baseName);
  const mp3Path = path.join(dir, `${safeBaseName}.mp3`);
  if (await pathExists(mp3Path)) {
    return mp3Path;
  }

  try {
    const entries = await fs.promises.readdir(dir);
    for (const entry of entries) {
      if (entry.startsWith(safeBaseName)) {
        return path.join(dir, entry);
      }
    }
  } catch {
    // Fallback to extension probing below.
  }

  for (const ext of ['.m4a', '.webm', '.opus', '.ogg', '.wav']) {
    const filePath = path.join(dir, `${safeBaseName}${ext}`);
    if (await pathExists(filePath)) {
      return filePath;
    }
  }

  return null;
}
