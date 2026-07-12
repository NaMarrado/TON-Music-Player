import { Alert } from 'react-native';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  checkMobileForUpdates,
  getMobileUpdateActionKey,
  installMobileUpdate,
} from '../services/app-update';

export function useStartupUpdateCheck(ready: boolean) {
  const { t } = useTranslation('settings');
  const startupUpdateCheckedRef = useRef(false);

  useEffect(() => {
    if (!ready || startupUpdateCheckedRef.current) {
      return;
    }

    startupUpdateCheckedRef.current = true;

    void (async () => {
      try {
        const result = await checkMobileForUpdates();
        if (!result.hasUpdate) {
          return;
        }

        Alert.alert(
          t('updateDialogTitle'),
          undefined,
          [
            {
              text: t('updateDialogLater'),
              style: 'cancel',
            },
            {
              text: t(getMobileUpdateActionKey(result)),
              onPress: () => {
                void (async () => {
                  try {
                    const installResult = await installMobileUpdate(result);

                    if (installResult.simulated) {
                      Alert.alert(
                        t('updateDialogTitle'),
                        t('updateSimulationToast', { version: result.latestVersion }),
                      );
                    }
                  } catch {
                    Alert.alert(t('updateDialogTitle'), t('updateDownloadFailedToast'));
                  }
                })();
              },
            },
          ],
        );
      } catch {
        // Startup checks stay silent until the GitHub endpoint is public.
      }
    })();
  }, [ready, t]);
}
