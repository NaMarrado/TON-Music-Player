import { BrowserWindow, net, powerMonitor } from 'electron';
import { createAppMenu } from '../menu';
import { ensureBinaries } from '../services/binary-manager';
import { getDownloadQueue } from '../services/download-queue';
import { countPerfEvent } from '../services/perf';
import { createTray, updateTrayDownloads } from '../tray';
import {
  getDesktopCloudAutoSyncRuntime,
  startDesktopCloudAutoSync,
} from '../services/cloud-sync/auto-sync-runtime';

export function attachWindowCloseBehavior(
  mainWindow: BrowserWindow,
  shouldForceQuit: () => boolean,
): void {
  mainWindow.on('close', (event) => {
    const queue = getDownloadQueue();
    const keepAliveForCloud = getDesktopCloudAutoSyncRuntime().shouldKeepApplicationAlive();
    if ((queue.hasActive() || keepAliveForCloud) && !shouldForceQuit()) {
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
  const stopCloudAutoSync = startDesktopCloudAutoSync();
  const cloudRuntime = getDesktopCloudAutoSyncRuntime();
  const handleResume = () => cloudRuntime.notifyResume();
  const handleSuspend = () => cloudRuntime.notifySuspend();
  powerMonitor.on('resume', handleResume);
  powerMonitor.on('suspend', handleSuspend);
  updateTrayDownloads(mainWindow);

  return () => {
    stopQueueSubscriptions();
    stopNetworkMonitoring();
    powerMonitor.off('resume', handleResume);
    powerMonitor.off('suspend', handleSuspend);
    stopCloudAutoSync();
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
