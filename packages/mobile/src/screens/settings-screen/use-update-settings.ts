import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getMobileAppVersion,
  installMobileUpdate,
} from '../../services/app-update';
import { showToast } from '../../stores/toast-store';
import { checkMobileUpdateState, useUpdateStore } from '../../stores/update-store';

export function useUpdateSettings() {
  const { t } = useTranslation('settings');
  const [appVersion] = useState(() => getMobileAppVersion());
  const updateResult = useUpdateStore((state) => state.result);
  const isCheckingUpdates = useUpdateStore((state) => state.isChecking);
  const [isPreparingUpdate, setIsPreparingUpdate] = useState(false);

  const checkForUpdates = useCallback(async () => {
    if (isCheckingUpdates) {
      return;
    }

    try {
      const result = await checkMobileUpdateState();

      if (result.hasUpdate) {
        showToast(t('updateAvailableToast', { version: result.latestVersion }), 'info', 4000);
      } else {
        showToast(t('upToDateToast'), 'success');
      }
    } catch {
      showToast(t('updateCheckFailedToast'), 'error', 4000);
    }
  }, [isCheckingUpdates, t]);

  const openAvailableUpdate = useCallback(async () => {
    if (!updateResult?.hasUpdate || isPreparingUpdate) {
      return;
    }

    setIsPreparingUpdate(true);

    try {
      const result = await installMobileUpdate(updateResult);

      if (result.simulated) {
        showToast(
          t('updateSimulationToast', { version: updateResult.latestVersion }),
          'success',
          5000,
        );
      } else if (result.openedDetailsPage) {
        showToast(t('updateReleasePageOpenedToast'), 'success', 5000);
      } else if (result.openedInstaller) {
        showToast(t('updateInstallerOpenedToast'), 'success', 5000);
      }
    } catch {
      showToast(t('updateDownloadFailedToast'), 'error', 5000);
    } finally {
      setIsPreparingUpdate(false);
    }
  }, [isPreparingUpdate, t, updateResult]);

  return {
    appVersion,
    checkForUpdates,
    isCheckingUpdates,
    isPreparingUpdate,
    openAvailableUpdate,
    updateResult,
  };
}
