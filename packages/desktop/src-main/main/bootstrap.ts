import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { closeDatabase, initDatabase } from '../services/database';
import { getDownloadQueue } from '../services/download-queue';
import { disposeLibraryOffloadWorker } from '../services/library-offload';
import { registerMainProcessHandlers } from './handlers';
import { attachWindowCloseBehavior, setupBackgroundServices } from './background-services';
import { registerMediaProtocolHandler } from './protocol';
import { cleanupSmokeMode, isHandlerSmokeMode, prepareSmokeMode, runHandlerSmokeMode } from './smoke-entry';
import { createMainWindow } from './window';
import { createAppMenu } from '../menu';
import { updateTrayDownloads } from '../tray';
import { applyDockIcon, applyPlatformAppIdentity } from './app-icon';
import { disposeDiscordPresenceService } from '../services/discord-presence';
import { getDesktopCloudAutoSyncRuntime } from '../services/cloud-sync/auto-sync-runtime';
import { flushListeningBeforeClose } from '../handlers/profile-handler';

// Local development must never share the installed player's database or media.
if (!app.isPackaged && process.env.TON_DEV_PROFILE_DIR) {
  const profile = path.resolve(process.env.TON_DEV_PROFILE_DIR);
  const music = path.join(profile, 'Music');
  const downloads = path.join(profile, 'Downloads');
  fs.mkdirSync(music, { recursive: true });
  fs.mkdirSync(downloads, { recursive: true });
  app.setPath('userData', profile);
  app.setPath('music', music);
  app.setPath('downloads', downloads);
  console.info('TON development profile:', profile);
}

prepareSmokeMode();

export function startMainProcess(): void {
  app.setName('TON');
  let mainWindow: BrowserWindow | null = null;
  let forceQuit = false;
  let quitAfterCloudShutdown = false;
  let cleanupBackgroundServices: (() => void) | null = null;
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
    return;
  }

  // Re-launching TON is an explicit user action. Auto Sync itself never calls
  // this path and therefore cannot show or focus a hidden gaming-session window.
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  void app.whenReady().then(async () => {
    applyPlatformAppIdentity();
    applyDockIcon();
    initDatabase();

    if (isHandlerSmokeMode()) {
      try {
        await runHandlerSmokeMode();
      } finally {
        closeDatabase();
        // The smoke harness removes its temporary userData directory before
        // Electron exits. Release Chromium's lockfile first so Windows can
        // delete that directory deterministically.
        app.releaseSingleInstanceLock();
        cleanupSmokeMode();
        app.quit();
      }
      return;
    }

    registerMainProcessHandlers();
    getDownloadQueue().resumeOnStartup();
    registerMediaProtocolHandler();

    mainWindow = createMainWindow();
    cleanupBackgroundServices = setupBackgroundServices(mainWindow, () => forceQuit);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
        attachWindowCloseBehavior(mainWindow, () => forceQuit);
        createAppMenu(mainWindow);
        updateTrayDownloads(mainWindow);
      } else if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
      }
    });
  });

  app.on('before-quit', (event) => {
    forceQuit = true;
    if (cleanupBackgroundServices && !quitAfterCloudShutdown) {
      event.preventDefault();
      void Promise.all([
        getDesktopCloudAutoSyncRuntime().shutdownForQuit(),
        ...BrowserWindow.getAllWindows().map(flushListeningBeforeClose),
      ]).catch((error: unknown) => {
        console.error('Shutdown flush failed:', error);
      }).finally(() => {
        quitAfterCloudShutdown = true;
        app.quit();
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      const queue = getDownloadQueue();
      if (!queue.hasActive() && !getDesktopCloudAutoSyncRuntime().shouldKeepApplicationAlive()) {
        app.quit();
      }
    }
  });

  app.on('will-quit', () => {
    cleanupBackgroundServices?.();
    void disposeDiscordPresenceService();
    void disposeLibraryOffloadWorker();
    closeDatabase();
  });
}
