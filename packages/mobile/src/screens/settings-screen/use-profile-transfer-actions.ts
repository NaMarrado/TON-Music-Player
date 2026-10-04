import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyStoredLanguagePreference } from '../../i18n';
import { exportMobileProfile, importMobileProfile } from '../../services/profile-bundle';
import { loadTracks } from '../../stores/library-store';
import { loadPlaylists } from '../../stores/playlist-store';
import { showToast } from '../../stores/toast-store';

export function useProfileTransferActions() {
  const { t } = useTranslation('settings');
  const [isExportingProfile, setIsExportingProfile] = useState(false);
  const [isImportingProfile, setIsImportingProfile] = useState(false);

  const exportProfile = useCallback(async () => {
    if (isExportingProfile || isImportingProfile) return;
    setIsExportingProfile(true);
    try {
      const result = await exportMobileProfile();
      if (!result.saved) return;
      const message = t('profileExportSuccess', { starred: result.starred, playlists: result.playlists, sessions: result.sessions });
      showToast(result.unidentified > 0 ? `${message} ${t('profileExportSkipped', { count: result.unidentified })}` : message, 'success');
    } catch {
      showToast(t('profileExportFailed'), 'error');
    } finally {
      setIsExportingProfile(false);
    }
  }, [isExportingProfile, isImportingProfile, t]);

  const importProfile = useCallback(async () => {
    if (isExportingProfile || isImportingProfile) return;
    setIsImportingProfile(true);
    try {
      const result = await importMobileProfile();
      if (!result.imported) return;
      if (result.language) await applyStoredLanguagePreference(result.language);
      await Promise.all([loadTracks(), loadPlaylists()]);
      const missing = result.starsMissing + result.playlistTracksMissing;
      const message = t('profileImportSuccessMobile', { starred: result.starred, playlists: result.playlistsCreated, sessions: result.sessions });
      showToast(missing > 0 ? `${message} ${t('profileImportMissing', { count: missing })}` : message, 'success');
    } catch {
      showToast(t('profileImportInvalid'), 'error');
    } finally {
      setIsImportingProfile(false);
    }
  }, [isExportingProfile, isImportingProfile, t]);

  return { exportProfile, importProfile, isExportingProfile, isImportingProfile };
}
