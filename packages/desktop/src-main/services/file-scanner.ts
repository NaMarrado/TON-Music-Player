/**
 * File Scanner - recursively finds audio files in a directory.
 */

import fs from 'fs';
import { scanDirectoryOffthread } from './library-offload';

export interface ScanProgress {
  phase: 'scanning' | 'reading' | 'importing';
  found: number;
  processed: number;
  total: number;
  currentFile: string;
}

export type ProgressCallback = (progress: ScanProgress) => void;

export async function getFileStatsAsync(
  filePath: string,
): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const stat = await fs.promises.stat(filePath);
    return { size: stat.size, mtimeMs: Math.floor(stat.mtimeMs) };
  } catch {
    return null;
  }
}

export { scanDirectoryOffthread };
