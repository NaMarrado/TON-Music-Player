import { BrowserWindow } from 'electron';
import { pickImportBundlePath } from './dialogs';
import { runLibraryImportBundle } from './import-runner';
import { createProgressSender } from './progress';
import type { ImportResult, ImportStartOptions } from './types';

function resolveEventWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  try {
    return BrowserWindow.fromWebContents(event.sender);
  } catch {
    return null;
  }
}

export async function startLibraryImport(
  event: Electron.IpcMainInvokeEvent,
  options?: ImportStartOptions,
): Promise<ImportResult> {
  const win = resolveEventWindow(event);
  const bundlePath = await pickImportBundlePath(win, options?.bundlePath);

  if (!bundlePath) {
    return { importedTracks: 0, skippedTracks: 0, importedPlaylists: 0 };
  }

  const sendProgress = createProgressSender(event.sender, 'import:progress');
  const result = await runLibraryImportBundle(bundlePath, sendProgress);
  return {
    importedTracks: result.importedTracks,
    skippedTracks: result.skippedTracks,
    importedPlaylists: result.importedPlaylists,
  };
}
