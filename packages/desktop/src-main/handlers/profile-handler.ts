import { randomUUID } from 'node:crypto';
import electron, { type BrowserWindow } from 'electron';
import type { ListeningSessionSnapshot, PlaybackObservation, ProfileQuery } from '@ton/core';
import { getDb } from '../services/database/connection';
import { getDesktopProfileDevice, recordDesktopProfileEvents } from '../services/listening-profile/store';
import {
  getActiveListeningSession,
  getListeningProfileSummary,
  recordListeningSession,
} from './profile-handler-data';

const pendingFlushes = new Map<string, { senderId: number; resolve: () => void }>();

export function registerProfileHandlers(): void {
  const { ipcMain } = electron;
  ipcMain.handle('profile:get-summary', (_event, query?: ProfileQuery) => getListeningProfileSummary(getDb(), query));
  ipcMain.handle('profile:get-device', () => getDesktopProfileDevice(getDb()));
  ipcMain.handle('profile:record-events', (_event, events: PlaybackObservation[]) => {
    recordDesktopProfileEvents(getDb(), events);
  });
  ipcMain.handle('profile:record-listening', (_event, snapshot: ListeningSessionSnapshot) => {
    recordListeningSession(getDb(), snapshot);
  });
  ipcMain.handle('profile:get-session', (_event, trackId: number) => (
    getActiveListeningSession(getDb(), trackId)
  ));
  ipcMain.handle('profile:flush-complete', (event, requestId: string) => {
    const pending = pendingFlushes.get(requestId);
    if (pending?.senderId === event.sender.id) pending.resolve();
  });
}

/** Main-process close/quit must await this before destroying the renderer or DB. */
export async function flushListeningBeforeClose(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  const requestId = randomUUID();
  const contents = window.webContents;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      contents.removeListener('destroyed', finish);
      pendingFlushes.delete(requestId);
      resolve();
    };
    const timeout = setTimeout(() => {
      console.warn('[Profile] Renderer listening flush timed out; periodic checkpoint remains durable.');
      finish();
    }, 3_000);
    pendingFlushes.set(requestId, { senderId: contents.id, resolve: finish });
    contents.once('destroyed', finish);
    try {
      contents.send('profile:flush-listening', requestId);
    } catch (error) {
      console.warn('[Profile] Renderer closed before its listening flush.', error);
      finish();
    }
  });
}
