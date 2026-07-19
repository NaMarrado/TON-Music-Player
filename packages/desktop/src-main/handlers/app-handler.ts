import { ipcMain, app, BrowserWindow, shell } from 'electron';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { checkForAppUpdate, type AppUpdatePlatform } from '@ton/core';
import {
  applyDesktopUiScale,
  persistDesktopUiScale,
  readDesktopUiScale,
} from '../main/ui-scale';

interface UpdateDownloadRequest {
  url: string;
  fileName?: string;
  version?: string;
  simulate?: boolean;
}

interface UpdateDownloadResult {
  filePath: string;
  fileName: string;
  openedInstaller: boolean;
  simulated: boolean;
}

const UPDATE_DOWNLOAD_DIRECTORY = 'TON Updates';

function mapDesktopUpdatePlatform(platform: NodeJS.Platform): AppUpdatePlatform {
  switch (platform) {
    case 'darwin':
      return 'desktop-darwin';
    case 'win32':
      return 'desktop-win32';
    case 'linux':
      return 'desktop-linux';
    default:
      return 'unknown';
  }
}

function sanitizeUpdateFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || 'TON-update.bin';
}

function resolveUpdateFileName(request: UpdateDownloadRequest): string {
  if (request.fileName?.trim()) {
    return sanitizeUpdateFileName(request.fileName);
  }

  if (request.simulate) {
    return sanitizeUpdateFileName(`TON-${request.version ?? 'next'}-update-simulation.txt`);
  }

  try {
    const fileName = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '');
    if (fileName) {
      return sanitizeUpdateFileName(fileName);
    }
  } catch {
    // Ignore malformed URLs and fall back to a safe default name.
  }

  return 'TON-update.bin';
}

async function downloadUpdateArtifact(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Update download failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Update download returned an empty response body');
  }

  await pipeline(
    Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>),
    createWriteStream(destinationPath),
  );
}

async function writeSimulationArtifact(
  destinationPath: string,
  version: string | undefined,
): Promise<void> {
  const lines = [
    'TON desktop update simulation',
    `Version: ${version ?? 'next'}`,
    `Created: ${new Date().toISOString()}`,
    '',
    'This file simulates a downloaded installer while the repository is still private.',
  ];

  await fs.writeFile(destinationPath, `${lines.join('\n')}\n`, 'utf8');
}

async function openDownloadedArtifact(filePath: string): Promise<boolean> {
  if (path.extname(filePath).toLowerCase() === '.appimage') {
    await fs.chmod(filePath, 0o755);
  }

  if (process.platform === 'darwin') {
    try {
      await shell.openExternal(pathToFileURL(filePath).href, { activate: true });
      return true;
    } catch {
      shell.showItemInFolder(filePath);
      return false;
    }
  }

  const openError = await shell.openPath(filePath);
  if (openError) {
    shell.showItemInFolder(filePath);
    return false;
  }

  return true;
}

export function registerAppHandlers(): void {
  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:get-platform', () => {
    return process.platform;
  });

  ipcMain.handle('app:get-ui-scale', () => readDesktopUiScale());

  ipcMain.handle('app:set-ui-scale', (event, value: unknown) => {
    const scale = persistDesktopUiScale(value);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) applyDesktopUiScale(window, scale);
    return scale;
  });

  ipcMain.handle('app:get-paths', () => {
    const userData = app.getPath('userData');
    return {
      userData,
      music: app.getPath('music'),
      downloads: app.getPath('downloads'),
      artwork: path.join(userData, 'artwork'),
    };
  });

  ipcMain.handle('app:check-update', async () => {
    return checkForAppUpdate(app.getVersion(), fetch, {
      platform: mapDesktopUpdatePlatform(process.platform),
    });
  });

  ipcMain.handle('app:open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle(
    'app:download-update',
    async (_event, request: UpdateDownloadRequest): Promise<UpdateDownloadResult> => {
      const updateDirectory = path.join(app.getPath('downloads'), UPDATE_DOWNLOAD_DIRECTORY);
      await fs.mkdir(updateDirectory, { recursive: true });

      const fileName = resolveUpdateFileName(request);
      const filePath = path.join(updateDirectory, fileName);

      if (request.simulate) {
        await writeSimulationArtifact(filePath, request.version);
      } else {
        await downloadUpdateArtifact(request.url, filePath);
      }

      const openedInstaller = await openDownloadedArtifact(filePath);

      return {
        filePath,
        fileName,
        openedInstaller,
        simulated: Boolean(request.simulate),
      };
    },
  );
}
