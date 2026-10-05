import electron from 'electron';
import type { StudioExportRequest, StudioExportResult, StudioProgressEvent, StudioTempDownloadResult } from '../../src/shared/studio-ipc';
import { exportStudioProject } from '../services/studio/export';
import { clearStudioTemp } from '../services/studio/paths';
import { parseTempDownloadRequest } from '../services/studio/request';
import { downloadStudioTemporary } from '../services/studio/temp-download';

const running = new Map<string, AbortController>();

function begin(id: string): AbortController {
  if (typeof id !== 'string' || id.length === 0 || id.length > 100) throw new Error('Invalid job id');
  running.get(id)?.abort();
  const controller = new AbortController();
  running.set(id, controller);
  return controller;
}

export function registerStudioHandlers(): void {
  const { app, ipcMain } = electron;
  // Temporary songs from an earlier run are never needed again: the project lives only in the open window.
  void app.whenReady().then(() => clearStudioTemp());

  ipcMain.handle('studio:download-temp', async (event, id: string, value: unknown): Promise<StudioTempDownloadResult> => {
    const request = parseTempDownloadRequest(value);
    const controller = begin(id);
    try {
      return await downloadStudioTemporary(request, controller.signal, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('studio:progress', { id, kind: 'download', progress } satisfies StudioProgressEvent);
      });
    } finally {
      if (running.get(id) === controller) running.delete(id);
    }
  });

  ipcMain.handle('studio:export', async (event, id: string, request: StudioExportRequest): Promise<StudioExportResult> => {
    const controller = begin(id);
    try {
      return await exportStudioProject(
        { project: request?.project, title: String(request?.title ?? ''), artist: String(request?.artist ?? '') },
        controller.signal,
        (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send('studio:progress', { id, kind: 'export', progress } satisfies StudioProgressEvent);
        },
      );
    } finally {
      if (running.get(id) === controller) running.delete(id);
    }
  });

  ipcMain.handle('studio:cancel', (_event, id: string) => {
    running.get(id)?.abort();
    running.delete(id);
  });

  ipcMain.handle('studio:cleanup-temp', (_event, keep: unknown) => (
    clearStudioTemp(Array.isArray(keep) ? keep.filter((item): item is string => typeof item === 'string') : [])
  ));
}
