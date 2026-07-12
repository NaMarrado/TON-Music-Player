import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb } from '../../services/database';
import { getFileStatsAsync, scanDirectoryOffthread } from '../../services/file-scanner';
import { readTrackMetadata } from '../../services/metadata-reader';
import { ZIP_EXTENSIONS } from '../playlist-helpers';
import { getExistingLibraryHashes } from './hashes';
import { extractZipArchive } from './zip';

export async function handleCheckDuplicates(
  inputPath: string,
): Promise<{ total: number; existing: number } | null> {
  try {
    const stat = await fs.promises.stat(inputPath);
    let files: string[];

    if (stat.isDirectory()) {
      files = await scanDirectoryOffthread(inputPath);
    } else {
      if (!ZIP_EXTENSIONS.includes(path.extname(inputPath).toLowerCase())) {
        return null;
      }

      const tempDir = path.join(os.tmpdir(), `ton-check-${Date.now()}`);
      await fs.promises.mkdir(tempDir, { recursive: true });

      try {
        await extractZipArchive(inputPath, tempDir);
        files = await scanDirectoryOffthread(tempDir);
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    if (files.length === 0) {
      return { total: 0, existing: 0 };
    }

    const db = getDb();
    const existingHashes = getExistingLibraryHashes(db);
    let existing = 0;

    for (const filePath of files) {
      const stats = await getFileStatsAsync(filePath);
      if (!stats) continue;

      const meta = await readTrackMetadata(filePath, stats.size);
      if (meta.file_hash && existingHashes.has(meta.file_hash)) {
        existing++;
      }
    }

    return { total: files.length, existing };
  } catch {
    return null;
  }
}
