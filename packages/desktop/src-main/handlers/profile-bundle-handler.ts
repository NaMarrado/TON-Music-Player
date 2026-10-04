import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import { parseProfileBundle } from '@ton/core';
import type { ProfileExportResult, ProfileImportSummary } from '../../src/shared/profile-ipc';
import { getDb } from '../services/database';
import { notifyDesktopProfileChanges } from '../services/listening-profile/store';
import { applyDesktopProfile, collectDesktopProfile } from '../services/profile-bundle';

/** A profile with years of listening history is a few megabytes; anything near this size is not a TON profile. */
const MAX_PROFILE_FILE_BYTES = 256 * 1024 * 1024;

const EMPTY_EXPORT: ProfileExportResult = { saved: false, path: null, settings: 0, starred: 0, playlists: 0, sessions: 0, unidentified: 0 };
const EMPTY_IMPORT: ProfileImportSummary = {
  imported: false, settings: 0, ignoredSettings: 0, starred: 0, starsMissing: 0, playlistsCreated: 0, playlistsSkipped: 0,
  playlistTracksMissing: 0, sessions: 0, sessionsRejected: 0,
};

/** Takes an optional absolute `.json` path from the renderer; anything else is ignored and the user is asked instead. */
function jsonPathOption(options: unknown, key: string): string | null {
  if (typeof options !== 'object' || options === null || !(key in options)) return null;
  const value: unknown = Reflect.get(options, key);
  return typeof value === 'string' && path.isAbsolute(value) && path.extname(value).toLowerCase() === '.json' ? value : null;
}

function defaultFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `TON profile ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

async function writeAtomic(target: string, content: string): Promise<void> {
  const staging = `${target}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(staging, content, 'utf8');
    await fs.promises.rename(staging, target);
  } catch (error) {
    await fs.promises.rm(staging, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function registerProfileBundleHandlers(): void {
  const { app, BrowserWindow, dialog, ipcMain } = electron;

  ipcMain.handle('profile:export', async (event, options?: unknown): Promise<ProfileExportResult> => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    let target = jsonPathOption(options, 'destinationPath');
    if (!target) {
      const saveOptions = { title: 'Export profile', defaultPath: path.join(app.getPath('downloads'), defaultFileName()), filters: [{ name: 'TON profile', extensions: ['json'] }] };
      const chosen = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
      if (chosen.canceled || !chosen.filePath) return EMPTY_EXPORT;
      target = chosen.filePath;
    }
    const { bundle, unidentifiedStars, unidentifiedPlaylistTracks } = collectDesktopProfile(getDb());
    await writeAtomic(target, JSON.stringify(bundle));
    return {
      saved: true,
      path: target,
      settings: Object.keys(bundle.settings).length,
      starred: bundle.starred.length,
      playlists: bundle.playlists.length,
      sessions: bundle.listening.length,
      unidentified: unidentifiedStars + unidentifiedPlaylistTracks,
    };
  });

  ipcMain.handle('profile:import', async (event, options?: unknown): Promise<ProfileImportSummary> => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    let source = jsonPathOption(options, 'sourcePath');
    if (!source) {
      const openOptions = { title: 'Import profile', filters: [{ name: 'TON profile', extensions: ['json'] }], properties: ['openFile' as const] };
      const chosen = window ? await dialog.showOpenDialog(window, openOptions) : await dialog.showOpenDialog(openOptions);
      if (chosen.canceled || chosen.filePaths.length === 0) return EMPTY_IMPORT;
      source = chosen.filePaths[0];
    }
    const stats = await fs.promises.stat(source);
    if (stats.size > MAX_PROFILE_FILE_BYTES) throw new Error('This is not a TON profile file');
    const parsed = parseProfileBundle(await fs.promises.readFile(source, 'utf8'));
    const result = applyDesktopProfile(getDb(), parsed);
    notifyDesktopProfileChanges();
    return { imported: true, ...result };
  });
}
