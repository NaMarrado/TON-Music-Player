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
  const m4aPath = path.join(dir, `${safeBaseName}.m4a`);
  return await pathExists(m4aPath) ? m4aPath : null;
}
