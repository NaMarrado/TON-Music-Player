import { app, dialog, type BrowserWindow } from 'electron';
import path from 'path';
import type { ExportBundleFormat, ExportDestination, ExportKind } from './types';

const KIND_NAMES: Record<ExportKind, string> = { library: 'Library', playlist: 'Playlists', songs: 'Songs', profile: 'Profile' };

function buildExportFolderName(kind: ExportKind, now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${KIND_NAMES[kind]} - TON - ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

function inferExportBundleFormat(destinationPath: string): ExportBundleFormat {
  return path.extname(destinationPath).toLowerCase() === '.ton' ? 'archive' : 'folder';
}

export async function pickExportDestination(
  win: BrowserWindow | null,
  destinationPath?: string,
  bundleFormat?: ExportBundleFormat,
  kind: ExportKind = 'library',
): Promise<ExportDestination | null> {
  const title = `Export ${KIND_NAMES[kind]}`;
  if (destinationPath) {
    return {
      destinationPath,
      bundleFormat: bundleFormat ?? inferExportBundleFormat(destinationPath),
    };
  }

  if (!win) {
    return null;
  }

  const formatChoice = await dialog.showMessageBox(win, {
    type: 'question',
    title,
    message: title,
    buttons: ['Archive (.ton)', 'Folder bundle', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });

  if (formatChoice.response === 2) {
    return null;
  }

  if (formatChoice.response === 0) {
    const archiveResult = await dialog.showSaveDialog(win, {
      title,
      defaultPath: path.join(app.getPath('downloads'), `${buildExportFolderName(kind)}.ton`),
      filters: [{ name: 'TON Library', extensions: ['ton'] }],
    });

    if (archiveResult.canceled || !archiveResult.filePath) {
      return null;
    }

    return {
      destinationPath: archiveResult.filePath,
      bundleFormat: 'archive',
    };
  }

  const folderResult = await dialog.showOpenDialog(win, {
    title: 'Select Export Destination',
    defaultPath: app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  });

  if (folderResult.canceled || folderResult.filePaths.length === 0) {
    return null;
  }

  return {
    destinationPath: path.join(folderResult.filePaths[0], buildExportFolderName(kind)),
    bundleFormat: 'folder',
  };
}

export async function pickImportBundlePath(
  win: BrowserWindow | null,
  bundlePath?: string,
): Promise<string | null> {
  if (bundlePath) {
    return bundlePath;
  }

  if (!win) {
    return null;
  }

  const result = await dialog.showOpenDialog(win, {
    title: 'Import',
    defaultPath: app.getPath('downloads'),
    filters: [{ name: 'TON Library', extensions: ['ton', 'zip'] }],
    properties: ['openFile', 'openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}
