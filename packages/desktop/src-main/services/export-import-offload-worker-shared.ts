import fs from 'node:fs';
import path from 'node:path';
import type { ExportManifest } from '@ton/core';

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeTrackFileName(entry: ExportManifest['tracks'][number], ext: string): string {
  return `${entry.metadata.artist || 'Unknown'} - ${entry.metadata.title || 'Untitled'}${ext}`
    .replace(/[<>:"/\\|?*]/g, '_');
}

export function getUniqueName(usedNames: Set<string>, fileName: string): string {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }

  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let index = 2;
  let candidate = `${stem} (${index})${ext}`;

  while (usedNames.has(candidate)) {
    index += 1;
    candidate = `${stem} (${index})${ext}`;
  }

  usedNames.add(candidate);
  return candidate;
}
