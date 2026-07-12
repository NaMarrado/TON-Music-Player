import fs from 'fs';
import path from 'path';
import { BrowserWindow, dialog } from 'electron';
import { ZIP_EXTENSIONS } from '../playlist-helpers';

export async function handlePickImportPath(): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return null;

  const props: Electron.OpenDialogOptions['properties'] =
    process.platform === 'win32' ? ['openFile'] : ['openFile', 'openDirectory'];

  const result = await dialog.showOpenDialog(win, {
    title: 'Import playlist',
    filters: [
      { name: 'ZIP Archives', extensions: ['zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: props,
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const selectedPath = result.filePaths[0];

  try {
    const stat = await fs.promises.stat(selectedPath);
    if (stat.isDirectory()) return selectedPath;
  } catch {
    // Fall through to extension validation.
  }

  if (ZIP_EXTENSIONS.includes(path.extname(selectedPath).toLowerCase())) {
    return selectedPath;
  }

  await dialog.showMessageBox(win, {
    type: 'error',
    title: 'Invalid file',
    message: 'Only .zip archives and folders are supported.',
  });
  return null;
}
