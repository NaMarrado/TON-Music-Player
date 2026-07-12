import { BrowserWindow } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  DESKTOP_MIN_WINDOW_HEIGHT,
  DESKTOP_MIN_WINDOW_WIDTH,
} from '../../src/shared/layout';
import { getAppIconPath } from './app-icon';

const mainProcessDir = dirname(fileURLToPath(import.meta.url));

export function createMainWindow(): BrowserWindow {
  const iconPath = getAppIconPath();

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: DESKTOP_MIN_WINDOW_WIDTH,
    minHeight: DESKTOP_MIN_WINDOW_HEIGHT,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#e8e8e8',
      height: 36,
    },
    backgroundColor: '#050505',
    icon: process.platform === 'darwin' ? undefined : (iconPath ?? undefined),
    webPreferences: {
      preload: join(mainProcessDir, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(mainProcessDir, '../renderer/index.html'));
  }

  return mainWindow;
}
