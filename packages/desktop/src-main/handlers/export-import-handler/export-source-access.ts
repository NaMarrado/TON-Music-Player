import fs from 'node:fs';
import path from 'node:path';
import { dialog, type BrowserWindow } from 'electron';

async function canReadFile(filePath: string): Promise<boolean> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(filePath, 'r');
    return true;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function commonParentDirectory(filePaths: string[]): string {
  if (filePaths.length === 0) {
    return '';
  }

  let common = path.dirname(path.resolve(filePaths[0]));
  for (const filePath of filePaths.slice(1)) {
    const resolved = path.resolve(filePath);
    while (resolved !== common && !resolved.startsWith(`${common}${path.sep}`)) {
      const parent = path.dirname(common);
      if (parent === common) {
        return common;
      }
      common = parent;
    }
  }
  return common;
}

function isInsideDirectory(filePath: string, directoryPath: string): boolean {
  const relative = path.relative(path.resolve(directoryPath), path.resolve(filePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function findUnreadableFiles(filePaths: string[]): Promise<string[]> {
  const unreadable: string[] = [];
  for (const filePath of filePaths) {
    if (!(await canReadFile(filePath))) {
      unreadable.push(filePath);
    }
  }
  return unreadable;
}

export async function ensureExportSourcesReadable(
  win: BrowserWindow | null,
  sourcePaths: string[],
): Promise<void> {
  const uniquePaths = [...new Set(sourcePaths.filter(Boolean))];
  let unreadable = await findUnreadableFiles(uniquePaths);
  if (unreadable.length === 0) {
    return;
  }

  if (process.platform === 'darwin' && win) {
    const requiredDirectory = commonParentDirectory(unreadable);
    const result = await dialog.showOpenDialog(win, {
      title: 'Allow TON to access your music',
      message: 'Select the folder shown below so TON can read the Library files being exported.',
      buttonLabel: 'Allow Access',
      defaultPath: requiredDirectory,
      properties: ['openDirectory'],
    });

    const selectedDirectory = result.filePaths[0];
    if (
      !result.canceled
      && selectedDirectory
      && unreadable.every((filePath) => isInsideDirectory(filePath, selectedDirectory))
    ) {
      unreadable = await findUnreadableFiles(unreadable);
    }
  }

  if (unreadable.length > 0) {
    throw new Error(`TON cannot read ${unreadable.length} Library file(s) required by this export.`);
  }
}
