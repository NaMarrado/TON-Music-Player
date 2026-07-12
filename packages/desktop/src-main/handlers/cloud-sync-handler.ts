import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { CloudStorageConfig, CloudSyncProgress } from '@ton/core';
import {
  fetchCloudLibraryToDesktop,
  getCloudConfigForDesktop,
  saveCloudConfigForDesktop,
  syncCloudLibraryForDesktop,
  testCloudConnectionForDesktop,
  uploadMissingLocalToCloud,
} from '../services/cloud-sync';

let cancelRequested = false;

function createProgressSender(event: IpcMainInvokeEvent) {
  return (progress: CloudSyncProgress) => {
    event.sender.send('cloud:progress', progress);
  };
}

function shouldCancel(): boolean {
  return cancelRequested;
}

async function runCloudTask<T>(
  event: IpcMainInvokeEvent,
  run: (onProgress: (progress: CloudSyncProgress) => void) => Promise<T>,
): Promise<T | null> {
  cancelRequested = false;
  try {
    return await run(createProgressSender(event));
  } catch (error) {
    if (error instanceof Error && error.message === 'cloud_sync_cancelled') {
      event.sender.send('cloud:progress', {
        phase: 'cancelled',
        current: 0,
        total: 0,
        uploaded: 0,
        downloaded: 0,
        skipped: 0,
        failed: 0,
      } satisfies CloudSyncProgress);
      return null;
    }
    throw error;
  } finally {
    cancelRequested = false;
  }
}

export function registerCloudSyncHandlers(): void {
  ipcMain.handle('cloud:get-config', () => getCloudConfigForDesktop());
  ipcMain.handle('cloud:save-config', (_event, config: CloudStorageConfig) => (
    saveCloudConfigForDesktop(config)
  ));
  ipcMain.handle('cloud:test-config', async (_event, config?: CloudStorageConfig) => {
    await testCloudConnectionForDesktop(config);
  });
  ipcMain.handle('cloud:upload-missing', async (event) => (
    runCloudTask(event, (onProgress) => uploadMissingLocalToCloud(onProgress, shouldCancel))
  ));
  ipcMain.handle('cloud:fetch-library', async (event) => (
    runCloudTask(event, (onProgress) => fetchCloudLibraryToDesktop(onProgress, shouldCancel))
  ));
  ipcMain.handle('cloud:sync-now', async (event) => (
    runCloudTask(event, (onProgress) => syncCloudLibraryForDesktop(onProgress, shouldCancel))
  ));
  ipcMain.handle('cloud:cancel', () => {
    cancelRequested = true;
  });
}
