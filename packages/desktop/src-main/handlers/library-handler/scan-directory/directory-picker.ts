import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';

export async function pickScanDirectory(event: IpcMainInvokeEvent): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return null;
  }

  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Select Music Folder',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}
