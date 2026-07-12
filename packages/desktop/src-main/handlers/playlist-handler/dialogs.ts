import { BrowserWindow, dialog, ipcMain } from 'electron';

export function registerPlaylistDialogHandlers(): void {
  ipcMain.handle('playlist:pick-cover', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) {
      return null;
    }

    const result = await dialog.showOpenDialog(win, {
      title: 'Choose cover image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
}
