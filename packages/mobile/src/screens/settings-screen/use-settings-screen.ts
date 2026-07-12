import { useLanguageSettings } from './use-language-settings';
import { useLoudnessAnalysis } from './use-loudness-analysis';
import { useSpotifySettings } from './use-spotify-settings';
import { useUpdateSettings } from './use-update-settings';
import { useLibraryTransferActions } from './use-library-transfer-actions';
import { useCloudSyncSettings } from './use-cloud-sync-settings';

export function useSettingsScreen() {
  const languageSettings = useLanguageSettings();
  const loudnessAnalysis = useLoudnessAnalysis();
  const spotifySettings = useSpotifySettings();
  const updateSettings = useUpdateSettings();
  const libraryTransferActions = useLibraryTransferActions();
  const cloudSyncSettings = useCloudSyncSettings();

  return {
    ...languageSettings,
    ...loudnessAnalysis,
    ...spotifySettings,
    ...updateSettings,
    ...libraryTransferActions,
    ...cloudSyncSettings,
  };
}
