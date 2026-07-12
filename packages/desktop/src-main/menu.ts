/**
 * Application Menu - macOS native menu bar with playback controls.
 *
 * On macOS: full menu with app name, File, Edit, View, Controls, Window, Help.
 * On other platforms: minimal menu (Edit + View only).
 */

import { Menu, BrowserWindow, app, shell } from 'electron';

const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged;
const APP_NAME = 'TON';
const AUTHOR_URL = 'https://linktr.ee/namarrado';

export function createAppMenu(mainWindow: BrowserWindow): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    // ── App menu (macOS only) ──
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Settings',
                accelerator: 'Cmd+,' as const,
                click: () => mainWindow.webContents.send('menu:settings'),
              },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } as Electron.MenuItemConstructorOptions,
        ]
      : []),

    // ── File ──
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Library',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow.webContents.send('menu:import'),
        },
        {
          label: 'Export Library',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu:export'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // ── Edit ──
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    // ── View ──
    {
      label: 'View',
      submenu: [
        ...(isDev
          ? [
              { role: 'reload' as const },
              { role: 'forceReload' as const },
              { role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ]
          : []),
        { role: 'togglefullscreen' },
      ],
    },

    // ── Controls ──
    {
      label: 'Controls',
      submenu: [
        {
          label: 'Play / Pause',
          click: () => mainWindow.webContents.send('tray:play-pause'),
        },
        {
          label: 'Next Track',
          accelerator: isMac ? 'Cmd+Right' : 'Ctrl+Right',
          click: () => mainWindow.webContents.send('tray:next'),
        },
        {
          label: 'Previous Track',
          accelerator: isMac ? 'Cmd+Left' : 'Ctrl+Left',
          click: () => mainWindow.webContents.send('tray:prev'),
        },
      ],
    },

    // ── Window ──
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
            ]
          : [{ role: 'close' as const }]),
      ],
    },

    // ── Help ──
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: () => shell.openExternal(AUTHOR_URL),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
