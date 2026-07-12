import { ipcMain } from 'electron';
import { getDb } from '../services/database';
import { getBinaryStatusDetails, repairBinaries } from '../services/binary-manager';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (_event, key: string) => {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  });

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  });

  ipcMain.handle('binaries:get-status', async () => {
    return getBinaryStatusDetails();
  });

  ipcMain.handle('binaries:repair', async (event) => {
    return repairBinaries((message) => {
      event.sender.send('binaries:status', message);
    });
  });
}
