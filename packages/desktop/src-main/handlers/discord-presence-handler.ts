import { ipcMain } from 'electron';
import { isDiscordPresencePayload } from '../../src/shared/discord-presence';
import { getDiscordPresenceService } from '../services/discord-presence';

export function registerDiscordPresenceHandlers(): void {
  ipcMain.handle('discord:sync-activity', (_event, payload: unknown) => {
    if (!isDiscordPresencePayload(payload)) {
      throw new Error('Invalid Discord presence payload');
    }
    getDiscordPresenceService().sync(payload);
  });

  ipcMain.handle('discord:clear-activity', () => {
    getDiscordPresenceService().clear();
  });
}
