import { BrowserWindow, Tray, type BrowserWindow as BrowserWindowType } from 'electron';
import { getDownloadQueue } from '../services/download-queue';
import { updateTrayContextMenu } from './context-menu';
import { createTrayIcon } from './icon';
import {
  getCurrentTitle,
  getDownloadInfo,
  getTray,
  setCurrentTitle,
  setDownloadInfo,
  setTray,
} from './state';

function resolveWindow(mainWindow?: BrowserWindowType): BrowserWindowType | null {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ?? null;
}

export function createTray(mainWindow: BrowserWindowType): Tray {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip('TON');
  setTray(tray);
  updateTrayContextMenu(mainWindow);

  tray.on('click', () => {
    const windowTarget = resolveWindow(mainWindow);
    if (!windowTarget) {
      return;
    }
    if (windowTarget.isVisible()) {
      windowTarget.focus();
    } else {
      windowTarget.show();
    }
  });

  return tray;
}

export function updateTrayTitle(title: string, mainWindow?: BrowserWindowType): void {
  setCurrentTitle(title);
  const tray = getTray();
  if (!tray) {
    return;
  }

  tray.setToolTip(getCurrentTitle());
  updateTrayContextMenu(mainWindow);
}

export function updateTrayDownloads(mainWindow?: BrowserWindowType): void {
  const queue = getDownloadQueue();
  const allDownloads = queue.getAll();
  const activeCount = allDownloads.filter((download) => (
    download.status === 'downloading'
    || download.status === 'resolving'
    || download.status === 'converting'
  )).length;
  const pendingCount = allDownloads.filter((download) => download.status === 'pending').length;

  setDownloadInfo(
    activeCount > 0 || pendingCount > 0
      ? `Downloading: ${activeCount} active, ${pendingCount} queued`
      : '',
  );

  const tray = getTray();
  if (!tray) {
    return;
  }

  tray.setToolTip(getDownloadInfoOrTitle());
  updateTrayContextMenu(mainWindow);
}

export function destroyTray(): void {
  const tray = getTray();
  if (!tray) {
    return;
  }

  tray.destroy();
  setTray(null);
}

function getDownloadInfoOrTitle(): string {
  return getDownloadInfo() || getCurrentTitle();
}
