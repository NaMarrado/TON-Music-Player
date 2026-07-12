import { registerDownloadPlaylistImportHandler } from './playlist-import';
import { registerDownloadQueueHandlers } from './queue-actions';

export function registerDownloadHandlers(): void {
  registerDownloadQueueHandlers();
  registerDownloadPlaylistImportHandler();
}
