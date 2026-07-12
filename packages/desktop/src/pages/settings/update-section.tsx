import { useEffect, useState } from 'react';
import type { AppUpdateCheck } from '@ton/core';
import { SectionHeader } from './helpers';
import type { SettingsLayout } from './use-settings-layout';
import { showToast } from '../../stores/toast-store';
import {
  checkDesktopForUpdates,
  downloadDesktopUpdate,
  getDesktopAppVersion,
  openDesktopUpdateUrl,
} from '../../services/app-update';

export function UpdateSection({
  layout,
  t,
}: {
  layout: SettingsLayout;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const [currentVersion, setCurrentVersion] = useState('...');
  const [updateResult, setUpdateResult] = useState<AppUpdateCheck | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPreparingUpdate, setIsPreparingUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getDesktopAppVersion().then((version) => {
      if (!cancelled) {
        setCurrentVersion(version);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheck = async () => {
    if (isChecking) {
      return;
    }

    setIsChecking(true);

    try {
      const result = await checkDesktopForUpdates();
      setCurrentVersion(result.currentVersion);
      setUpdateResult(result);

      if (result.hasUpdate) {
        showToast(t('updateAvailableToast', { version: result.latestVersion }), 'info');
      } else {
        showToast(t('upToDateToast'), 'success');
      }
    } catch {
      showToast(t('updateCheckFailedToast'), 'error', 5000);
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdateAction = async () => {
    if (!updateResult?.hasUpdate) {
      return;
    }

    if (!updateResult.canDownload) {
      await openDesktopUpdateUrl(updateResult.detailsUrl);
      return;
    }

    if (isPreparingUpdate) {
      return;
    }

    setIsPreparingUpdate(true);

    try {
      const result = await downloadDesktopUpdate(updateResult);
      showToast(
        result.simulated
          ? t('updateSimulationToast', { version: updateResult.latestVersion })
          : result.openedInstaller
            ? t('updateInstallerOpenedToast')
            : t('updateDownloadedToast'),
        'success',
        5000,
      );
    } catch {
      showToast(t('updateDownloadFailedToast'), 'error', 5000);
    } finally {
      setIsPreparingUpdate(false);
    }
  };

  return (
    <section>
      <SectionHeader
        compact={layout.compact}
        icon={
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v6" />
            <path d="M12 21v-6" />
            <path d="m4.9 4.9 4.2 4.2" />
            <path d="m14.9 14.9 4.2 4.2" />
            <path d="M3 12h6" />
            <path d="M21 12h-6" />
            <path d="m4.9 19.1 4.2-4.2" />
            <path d="m14.9 9.1 4.2-4.2" />
          </svg>
        }
        title={t('updateSection')}
      />

      <div className="flex flex-col gap-4" style={{ paddingLeft: layout.sectionIndent }}>
        <div
          className="flex justify-between gap-3"
          style={{
            alignItems: layout.compact ? 'flex-start' : 'center',
            flexDirection: layout.compact ? 'column' : 'row',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {t('currentVersion')}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
            {currentVersion}
          </span>
        </div>

        {updateResult && (
          <div
            className="flex justify-between gap-3"
            style={{
              alignItems: layout.compact ? 'flex-start' : 'center',
              flexDirection: layout.compact ? 'column' : 'row',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {t('latestVersion')}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              {updateResult.latestVersion}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void handleCheck()}
            disabled={isChecking || isPreparingUpdate}
            style={{
              padding: '9px 14px',
              borderRadius: '999px',
              border: '1px solid var(--border)',
              background: isChecking || isPreparingUpdate ? 'var(--bg-elevated)' : 'transparent',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: isChecking || isPreparingUpdate ? 'default' : 'pointer',
              opacity: isChecking || isPreparingUpdate ? 0.7 : 1,
            }}
          >
            {isChecking ? t('checkingForUpdates') : t('checkForUpdates')}
          </button>

          {updateResult?.hasUpdate && (
            <button
              onClick={() => void handleUpdateAction()}
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
                : updateResult.canDownload
                  ? t('downloadUpdate')
                  : t('openReleasePage')}
            </button>
          )}
        </div>

        {updateResult && !updateResult.hasUpdate && (
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              lineHeight: '1.6',
            }}
          >
            {t('upToDateMessage')}
          </p>
        )}
      </div>
    </section>
  );
}
