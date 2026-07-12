import { ipcMain } from 'electron';
import { handleSearchQuery, handleSpotifyPlaylistLookup } from './query-handler';

export function registerSearchHandlers(): void {
  ipcMain.handle('search:query', (event, query) => handleSearchQuery(event.sender, query));
  ipcMain.handle('search:spotify-playlist', (_event, url: string) => handleSpotifyPlaylistLookup(url));
}
