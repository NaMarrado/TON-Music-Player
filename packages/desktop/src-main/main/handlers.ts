import { registerAppHandlers } from '../handlers/app-handler';
import { registerDbHandlers } from '../handlers/db-handler';
import { registerDownloadHandlers } from '../handlers/download-handler';
import { registerExportImportHandlers } from '../handlers/export-import-handler';
import { registerCloudSyncHandlers } from '../handlers/cloud-sync-handler';
import { registerLibraryHandlers } from '../handlers/library-handler';
import { registerPlaylistHandlers } from '../handlers/playlist-handler';
import { registerSearchHandlers } from '../handlers/search-handler';
import { registerSettingsHandlers } from '../handlers/settings-handler';
import { registerDiscordPresenceHandlers } from '../handlers/discord-presence-handler';
import { registerProfileHandlers } from '../handlers/profile-handler';
import { registerProfileBundleHandlers } from '../handlers/profile-bundle-handler';
import { registerStudioHandlers } from '../handlers/studio-handler';

export function registerMainProcessHandlers(): void {
  registerDbHandlers();
  registerSettingsHandlers();
  registerDiscordPresenceHandlers();
  registerProfileHandlers();
  registerCloudSyncHandlers();
  registerAppHandlers();
  registerLibraryHandlers();
  registerSearchHandlers();
  registerDownloadHandlers();
  registerPlaylistHandlers();
  registerExportImportHandlers();
  registerProfileBundleHandlers();
  registerStudioHandlers();
}
