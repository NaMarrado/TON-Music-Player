import fs from 'fs';
import path from 'path';
import { sanitizeFilename, SUPPORTED_AUDIO_EXTENSIONS } from '@ton/core';
import { getLibraryDir } from '../library-paths';

export const getDownloadDir = getLibraryDir;

export function buildSafeOutputTitle(title: string): string {
  return sanitizeFilename(title);
}

export async function findOutputFile(dir: string, baseName: string): Promise<string | null> {
  const safeBaseName = sanitizeFilename(baseName);
  const prefix = `${safeBaseName}.`;
  const supportedExtensions = new Set<string>(SUPPORTED_AUDIO_EXTENSIONS);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .filter((name) => supportedExtensions.has(path.extname(name).toLowerCase()))
    .sort((left, right) => {
      const leftIsM4a = path.extname(left).toLowerCase() === '.m4a';
      const rightIsM4a = path.extname(right).toLowerCase() === '.m4a';
      return Number(rightIsM4a) - Number(leftIsM4a);
    });

  return candidates[0] ? path.join(dir, candidates[0]) : null;
}
