import fs from 'fs';
import path from 'path';
import { findNonCollidingFileAsync } from '../../../services/library-paths';

export async function copyIntoLibraryIfNeeded(
  filePath: string,
  libraryDir: string,
  resolvedLibraryDir: string,
): Promise<string> {
  const resolved = path.resolve(filePath);
  if (resolved.startsWith(resolvedLibraryDir)) {
    return filePath;
  }

  const libraryPath = await findNonCollidingFileAsync(libraryDir, path.basename(filePath));
  await fs.promises.copyFile(filePath, libraryPath);
  return libraryPath;
}

export async function cleanupCopiedDuplicate(sourcePath: string, libraryPath: string): Promise<void> {
  if (libraryPath === sourcePath) {
    return;
  }

  await fs.promises.unlink(libraryPath).catch(() => {});
}
