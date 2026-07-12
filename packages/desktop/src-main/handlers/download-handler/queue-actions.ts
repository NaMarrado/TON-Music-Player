import { ipcMain } from 'electron';
import type { DownloadRequest } from '@ton/core';
import { getDownloadQueue } from '../../services/download-queue';

export function registerDownloadQueueHandlers(): void {
  const queue = getDownloadQueue();

  ipcMain.handle('download:start', (_event, request: DownloadRequest) => queue.enqueue(request));
  ipcMain.handle('download:cancel', (_event, id: number) => {
    queue.cancel(id);
  });
  ipcMain.handle('download:cancel-all', () => {
    queue.cancelAllActive();
  });
  ipcMain.handle('download:retry', (_event, id: number) => {
    queue.retry(id);
  });
  ipcMain.handle('download:clear-completed', () => {
    queue.clearCompleted();
  });
  ipcMain.handle('download:clear-failed', () => {
    queue.clearFailed();
  });
  ipcMain.handle('download:clear-all', () => {
    queue.clearAll();
  });
  ipcMain.handle('download:get-all', () => queue.getAll());
}
