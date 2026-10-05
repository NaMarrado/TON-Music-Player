import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * Songs that only exist for a Studio session live here and never reach the Library. The folder sits in the profile's
 * own data directory, so a development profile can never delete files an installed copy of the app is using.
 */
export function getStudioTempDir(): string {
  return path.join(app.getPath('userData'), 'studio-temp');
}

export async function ensureStudioTempDir(): Promise<string> {
  const directory = getStudioTempDir();
  await fs.promises.mkdir(directory, { recursive: true });
  return directory;
}

export function isInsideStudioTemp(filePath: string): boolean {
  const relative = path.relative(getStudioTempDir(), path.resolve(filePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Deletes everything in the Studio temp folder except the listed files (the ones the open project still uses). */
export async function clearStudioTemp(keep: string[] = []): Promise<number> {
  const directory = getStudioTempDir();
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  const keepResolved = new Set(keep.map((item) => path.resolve(item)));
  let removed = 0;
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (keepResolved.has(path.resolve(full))) continue;
    await fs.promises.rm(full, { recursive: true, force: true }).catch(() => {});
    removed += 1;
  }
  return removed;
}
