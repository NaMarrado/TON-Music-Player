import { app, BrowserWindow } from 'electron';
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

prepareSmokeMode();

export function startMainProcess(): void {
  app.setName('TON');
  let mainWindow: BrowserWindow | null = null;
  let forceQuit = false;
  let cleanupBackgroundServices: (() => void) | null = null;

  void app.whenReady().then(async () => {
    applyPlatformAppIdentity();
    applyDockIcon();
    initDatabase();

    if (isHandlerSmokeMode()) {
      try {
        await runHandlerSmokeMode();
      } finally {
        closeDatabase();
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

  app.on('before-quit', () => {
    forceQuit = true;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      const queue = getDownloadQueue();
      if (!queue.hasActive()) {
        app.quit();
      }
    }
  });

  app.on('will-quit', () => {
    cleanupBackgroundServices?.();
    void disposeLibraryOffloadWorker();
    closeDatabase();
  });
}
