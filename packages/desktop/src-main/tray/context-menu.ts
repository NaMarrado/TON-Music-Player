import { BrowserWindow, Menu, app, type BrowserWindow as BrowserWindowType } from 'electron';
import { getCurrentTitle, getDownloadInfo, getTray } from './state';

function resolveWindow(mainWindow?: BrowserWindowType): BrowserWindowType | null {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ?? null;
}

export function updateTrayContextMenu(mainWindow?: BrowserWindowType): void {
  const windowTarget = resolveWindow(mainWindow);
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: getCurrentTitle(), enabled: false },
    { type: 'separator' },
    {
      label: 'Play / Pause',
      enabled: !!windowTarget,
      click: () => windowTarget?.webContents.send('tray:play-pause'),
    },
    {
      label: 'Next Track',
      enabled: !!windowTarget,
      click: () => windowTarget?.webContents.send('tray:next'),
    },
    {
      label: 'Previous Track',
      enabled: !!windowTarget,
      click: () => windowTarget?.webContents.send('tray:prev'),
    },
  ];

  const downloadInfo = getDownloadInfo();
  if (downloadInfo) {
    items.push({ type: 'separator' }, { label: downloadInfo, enabled: false });
  }

  items.push(
    { type: 'separator' },
    {
      label: 'Show Window',
      enabled: !!windowTarget,
      click: () => {
        windowTarget?.show();
        windowTarget?.focus();
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  );

  getTray()?.setContextMenu(Menu.buildFromTemplate(items));
}
