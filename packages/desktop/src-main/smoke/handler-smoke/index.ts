import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { registerExportImportHandlers } from '../../handlers/export-import-handler';
import { registerDownloadQueueHandlers } from '../../handlers/download-handler/queue-actions';
import { registerLibraryHandlers } from '../../handlers/library-handler';
import { registerPlaylistHandlers } from '../../handlers/playlist-handler';
import { assert } from './assert';
import { EXPECTED_HANDLER_CHANNELS } from './channels';
import {
  cleanupHandlerSmokePaths,
  prepareHandlerSmokePaths,
  requireSmokeRoot,
} from './paths';
import { runHandlerSmokeScenario } from './scenario';

type InvokeHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export type SmokeSummary = {
  registeredChannels: string[];
  scanResult: { imported: number; skipped: number };
  rescanResult: { imported: number; skipped: number };
  duplicateStatus: { total: number; existing: number } | null;
  playlistStatusBefore: { total: number; alreadyInLibrary: number; newTracks: number };
  addToLibraryResult: { added: number; skipped: number };
  playlistStatusAfter: { total: number; alreadyInLibrary: number; newTracks: number };
  folderExportResult: { trackCount: number; playlistCount: number; sizeBytes: number };
  folderImportResult: { importedTracks: number; skippedTracks: number; importedPlaylists: number };
  loudnessStats: { total: number; analyzed: number; missing: number };
  deleteResult: { deleted: number };
};

export async function runHandlerSmoke(): Promise<SmokeSummary> {
  const rootDir = requireSmokeRoot();

  const registeredHandlers = new Map<string, InvokeHandler>();
  const progressEvents: Array<{ channel: string; payload: unknown }> = [];
  const originalHandle = ipcMain.handle.bind(ipcMain);

  ipcMain.handle = (channel: string, handler: InvokeHandler) => {
    registeredHandlers.set(channel, handler);
    return undefined;
  };

  try {
    registerDownloadQueueHandlers();
    registerLibraryHandlers();
    registerPlaylistHandlers();
    registerExportImportHandlers();

    for (const channel of EXPECTED_HANDLER_CHANNELS) {
      assert(registeredHandlers.has(channel), `Handler ${channel} was not registered`);
    }

    const fakeEvent = {
      sender: {
        send(channel: string, payload: unknown) {
          progressEvents.push({ channel, payload });
        },
      },
    } as IpcMainInvokeEvent;

    const invoke = async <T>(channel: string, ...args: unknown[]): Promise<T> => {
      const handler = registeredHandlers.get(channel);
      assert(handler, `Missing handler for ${channel}`);
      return (await handler(fakeEvent, ...args)) as T;
    };

    return runHandlerSmokeScenario({
      invoke,
      progressEvents,
      rootDir,
      registeredChannels: [...EXPECTED_HANDLER_CHANNELS],
    });
  } finally {
    ipcMain.handle = originalHandle;
  }
}

export {
  cleanupHandlerSmokePaths,
  prepareHandlerSmokePaths,
};
