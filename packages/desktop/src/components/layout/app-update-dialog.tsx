import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppUpdateCheck } from '@ton/core';
import { Dialog } from '../ui/dialog';
import { showToast } from '../../stores/toast-store';
import {
  checkDesktopForUpdates,
  downloadDesktopUpdate,
  openDesktopUpdateUrl,
} from '../../services/app-update';

export function AppUpdateDialog() {
  const { t } = useTranslation('pages/settings');
  const [update, setUpdate] = useState<AppUpdateCheck | null>(null);
  const [isPreparingUpdate, setIsPreparingUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await checkDesktopForUpdates();
        if (!cancelled && result.hasUpdate) {
          setUpdate(result);
        }
      } catch {
        // Startup checks stay silent when GitHub is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) {
    return null;
  }

  const handlePrimaryAction = async () => {
    if (isPreparingUpdate) {
      return;
    }

    if (!update.canDownload) {
      await openDesktopUpdateUrl(update.detailsUrl);
      setUpdate(null);
      return;
    }

    setIsPreparingUpdate(true);

    try {
      const result = await downloadDesktopUpdate(update);
      showToast(
        result.simulated
          ? t('updateSimulationToast', { version: update.latestVersion })
          : result.openedInstaller
            ? t('updateInstallerOpenedToast')
            : t('updateDownloadedToast'),
        'success',
        5000,
      );
      setUpdate(null);
    } catch {
      showToast(t('updateDownloadFailedToast'), 'error', 5000);
    } finally {
      setIsPreparingUpdate(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => {
        if (!isPreparingUpdate) {
          setUpdate(null);
        }
      }}
      title={t('updateDialogTitle')}
      width="420px"
    >
      {update.notes && update.source !== 'simulation' && (
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.78rem',
            lineHeight: '1.5',
            marginBottom: '18px',
          }}
        >
          {update.notes}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => setUpdate(null)}
          disabled={isPreparingUpdate}
          style={{
            padding: '9px 14px',
            borderRadius: '999px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '0.78rem',
            cursor: isPreparingUpdate ? 'default' : 'pointer',
            opacity: isPreparingUpdate ? 0.65 : 1,
          }}
        >
          {t('updateDialogLater')}
        </button>
        <button
          onClick={() => void handlePrimaryAction()}
          disabled={isPreparingUpdate}
          style={{
            padding: '9px 14px',
            borderRadius: '999px',
            border: '1px solid var(--white)',
            background: 'var(--white)',
            color: 'var(--bg-deep)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: isPreparingUpdate ? 'default' : 'pointer',
            opacity: isPreparingUpdate ? 0.75 : 1,
          }}
        >
          {isPreparingUpdate
            ? t('preparingUpdate')
            : update.canDownload
              ? t('downloadUpdate')
              : t('openReleasePage')}
        </button>
      </div>
    </Dialog>
  );
}
