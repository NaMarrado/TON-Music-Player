import { useTranslation } from 'react-i18next';
import { SettingsGroup } from './helpers';
import { LanguageSection } from './language-section';
import { EqualizerSection } from './equalizer-section';
import { FrequencySection } from './frequency-section';
import { LoudnessSection } from './loudness-section';
import { ExportImportSection } from './export-import-section';
import { SpotifySection } from './spotify-section';
import { CloudSection } from './cloud-section';
import { DownloadSection } from './download-section';
import { UpdateSection } from './update-section';
import { SettingsCard } from './settings-card';
import { useSettingsLayout } from './use-settings-layout';
import { AppCredit } from '../../components/app-credit';
import { CommunityCard } from './community-card';
import { DiscordPresenceSection } from './discord-presence-section';
import { UiScaleSection } from './ui-scale-section';
import { useEffect } from 'react';
import { markDesktopUpdateSeen, useUpdateStore } from '../../stores/update-store';

export function SettingsPage() {
  const { t } = useTranslation('pages/settings');
  const layout = useSettingsLayout();
  const updateResult = useUpdateStore((state) => state.result);
  const hasUpdate = Boolean(updateResult?.hasUpdate);

  useEffect(() => {
    void markDesktopUpdateSeen();
  }, [hasUpdate, updateResult?.latestVersion]);

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      <div
        className="shrink-0 sticky top-0 z-10"
        style={{
          background: 'linear-gradient(var(--bg-deep) 60%, transparent)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div
          style={{
            maxWidth: `${layout.maxContentWidth}px`,
            margin: '0 auto',
            padding: `var(--desktop-page-top) ${layout.contentPaddingX}px 20px`,
          }}
        >
          <h1
            className="text-[1.7rem] font-bold tracking-tight"
            style={{ fontFamily: "'Syne', sans-serif", color: 'var(--white)', lineHeight: 1.4 }}
          >
            {t('title')}
          </h1>
        </div>
      </div>

      <div
        style={{
          maxWidth: `${layout.maxContentWidth}px`,
          width: '100%',
          margin: '0 auto',
          padding: `8px ${layout.contentPaddingX}px 120px`,
        }}
      >
        <SettingsGroup label={t('generalGroup')} compact={layout.compact}>
          <SettingsCard layout={layout}>
            <LanguageSection layout={layout} t={t} />
          </SettingsCard>
          <SettingsCard layout={layout}>
            <UiScaleSection layout={layout} t={t} />
          </SettingsCard>
          <SettingsCard layout={layout} attention={hasUpdate}>
            <UpdateSection layout={layout} t={t} />
          </SettingsCard>
        </SettingsGroup>

        <SettingsGroup label={t('audioGroup')} compact={layout.compact}>
          <SettingsCard layout={layout}>
            <EqualizerSection layout={layout} t={t} />
          </SettingsCard>
          <SettingsCard layout={layout}>
            <FrequencySection layout={layout} t={t} />
          </SettingsCard>
          <SettingsCard layout={layout}>
            <LoudnessSection layout={layout} t={t} />
          </SettingsCard>
        </SettingsGroup>

        <SettingsGroup label={t('connectionsGroup')} compact={layout.compact}>
          <SettingsCard layout={layout}>
            <SpotifySection layout={layout} t={t} />
          </SettingsCard>
          <SettingsCard layout={layout}>
            <DiscordPresenceSection layout={layout} t={t} />
          </SettingsCard>
          <SettingsCard layout={layout}>
            <CloudSection layout={layout} t={t} />
          </SettingsCard>
        </SettingsGroup>

        <SettingsGroup label={t('dataGroup')} compact={layout.compact}>
          <SettingsCard layout={layout}>
            <DownloadSection layout={layout} t={t} />
          </SettingsCard>
          <SettingsCard layout={layout}>
            <ExportImportSection layout={layout} t={t} />
          </SettingsCard>
        </SettingsGroup>

        <SettingsGroup label={t('communitySection')} compact={layout.compact}>
          <CommunityCard layout={layout} t={t} />
        </SettingsGroup>

        <div className="flex justify-center" style={{ paddingTop: '12px', paddingBottom: '8px' }}>
          <AppCredit align="center" />
        </div>
      </div>
    </div>
  );
}
