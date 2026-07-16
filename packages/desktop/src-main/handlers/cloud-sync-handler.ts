import { BrowserWindow, ipcMain } from 'electron';
import type { CloudStorageConfig, CloudSyncProgress } from '@ton/core';
import {
  getCloudConfigForDesktop,
  executeDesktopCloudCleanup,
  previewDesktopCloudCleanup,
  saveCloudConfigForDesktop,
  testCloudConnectionForDesktop,
} from '../services/cloud-sync';
import { getDesktopCloudAutoSyncRuntime } from '../services/cloud-sync/auto-sync-runtime';

async function runCloudTask(
  mode: 'upload' | 'fetch' | 'sync',
): Promise<Awaited<ReturnType<ReturnType<typeof getDesktopCloudAutoSyncRuntime>['runManual']>>> {
  try {
    return await getDesktopCloudAutoSyncRuntime().runManual(mode);
  } catch (error) {
    if (error instanceof Error && (error.message === 'cloud_sync_cancelled' || error.name === 'AbortError')) {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send('cloud:progress', {
          phase: 'cancelled',
          current: 0,
          total: 0,
          uploaded: 0,
          downloaded: 0,
          skipped: 0,
          failed: 0,
        } satisfies CloudSyncProgress);
      }
      return null;
    }
    throw error;
  }
}

function broadcastProgress(progress: CloudSyncProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('cloud:progress', progress);
  }
}

export function registerCloudSyncHandlers(): void {
  ipcMain.handle('cloud:get-config', () => getCloudConfigForDesktop());
  ipcMain.handle('cloud:save-config', (_event, config: CloudStorageConfig) => {
    const saved = saveCloudConfigForDesktop(config);
    getDesktopCloudAutoSyncRuntime().notifyConfigurationChanged();
    return saved;
  });
  ipcMain.handle('cloud:test-config', async (_event, config?: CloudStorageConfig) => {
    await testCloudConnectionForDesktop(config);
  });
  ipcMain.handle('cloud:get-auto-sync-status', () => (
    getDesktopCloudAutoSyncRuntime().getStatus()
  ));
  ipcMain.handle('cloud:set-auto-sync-enabled', (_event, enabled: boolean) => (
    getDesktopCloudAutoSyncRuntime().setEnabled(Boolean(enabled))
  ));
  ipcMain.handle('cloud:upload-missing', () => runCloudTask('upload'));
  ipcMain.handle('cloud:fetch-library', () => runCloudTask('fetch'));
  ipcMain.handle('cloud:sync-now', () => runCloudTask('fetch'));
  ipcMain.handle('cloud:preview-cleanup', () => (
    previewDesktopCloudCleanup(broadcastProgress)
  ));
  ipcMain.handle('cloud:execute-cleanup', async (_event, previewToken: string) => {
    try {
      return await getDesktopCloudAutoSyncRuntime().runExclusive((signal) => (
        executeDesktopCloudCleanup(previewToken, broadcastProgress, signal)
      ));
    } catch (error) {
      if (error instanceof Error
          && (error.message === 'cloud_sync_cancelled' || error.name === 'AbortError')) {
        broadcastProgress({
          phase: 'cancelled', current: 0, total: 0,
          uploaded: 0, downloaded: 0, skipped: 0, failed: 0,
        });
        return null;
      }
      throw error;
    }
  });
  ipcMain.handle('cloud:cancel', () => {
    getDesktopCloudAutoSyncRuntime().cancel();
  });
}
