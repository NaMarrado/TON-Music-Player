import { BrowserWindow, net } from 'electron';
import { createAppMenu } from '../menu';
import { ensureBinaries } from '../services/binary-manager';
import { getDownloadQueue } from '../services/download-queue';
import { countPerfEvent } from '../services/perf';
import { createTray, updateTrayDownloads } from '../tray';

export function attachWindowCloseBehavior(
  mainWindow: BrowserWindow,
  shouldForceQuit: () => boolean,
): void {
  mainWindow.on('close', (event) => {
    const queue = getDownloadQueue();
    if (queue.hasActive() && !shouldForceQuit()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

export function setupBackgroundServices(
  mainWindow: BrowserWindow,
  shouldForceQuit: () => boolean,
): () => void {
  createTray(mainWindow);
  createAppMenu(mainWindow);
  attachWindowCloseBehavior(mainWindow, shouldForceQuit);
  ensureDesktopBinaries(mainWindow);
  const stopQueueSubscriptions = attachQueueDrivenUpdates();
  const stopNetworkMonitoring = startAdaptiveNetworkMonitoring();
  updateTrayDownloads(mainWindow);

  return () => {
    stopQueueSubscriptions();
    stopNetworkMonitoring();
  };
}

function ensureDesktopBinaries(mainWindow: BrowserWindow): void {
  void ensureBinaries((message) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('binaries:status', message);
    }
  }).catch((error: unknown) => {
    console.error('Binary download failed:', error);
  });
}

function attachQueueDrivenUpdates(): () => void {
  const queue = getDownloadQueue();
  return queue.subscribe(() => {
    updateTrayDownloads();
  });
}

function startAdaptiveNetworkMonitoring(): () => void {
  const queue = getDownloadQueue();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const checkOnline = () => {
    countPerfEvent('network:poll');
    if (net.online) {
      queue.goOnline();
    } else {
      queue.goOffline();
    }
  };

  const syncMonitoring = () => {
    if (queue.hasActive()) {
      if (!intervalId) {
        intervalId = setInterval(checkOnline, 15000);
      }
      checkOnline();
      return;
    }

    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const unsubscribe = queue.subscribe(syncMonitoring);
  syncMonitoring();

  if (!queue.hasActive() && !net.online) {
    queue.goOffline();
  }

  return () => {
    unsubscribe();
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}
