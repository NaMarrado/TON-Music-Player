import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { LUFS_TARGET_DEFAULT } from '@ton/core';
import { useTranslation } from 'react-i18next';
import { getMobileUpdateActionKey } from '../../services/app-update';
import {
  getAudioSettingsSupportSnapshot,
} from '../../services/audio-settings';
import { usePlaybackStore } from '../../stores/playback-store';
import { detectDeviceLanguage } from './constants';
import { AboutCard } from './about-card';
import { EqualizerCard } from './equalizer-card';
import { ExportImportCard } from './export-import-card';
import { ExportSelectionModal } from './export-selection-modal';
import { FrequencyCard } from './frequency-card';
import { LanguageCard } from './language-card';
import { LibraryTransferProgressModal } from '../../components/library-transfer-progress-modal';
import { LoudnessCard } from './loudness-card';
import { SettingsGroup } from './primitives';
import { CommunityCard } from './community-card';
import { DownloadQualityCard } from './download-quality-card';
import { UpdateCard } from './update-card';
import { useSettingsScreen } from './use-settings-screen';
import { usePlaylistStore } from '../../stores/playlist-store';
import { useScreenTopPadding } from '../../hooks/use-screen-top-padding';
import { SettingsConnectionsGroup } from './settings-connections-group';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { loadPlaylists } from '../../stores/playlist-store';
import { useIsFocused } from '@react-navigation/native';
import { markMobileUpdateSeen } from '../../stores/update-store';

export function SettingsScreen() {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const frequencyEnabled = usePlaybackStore((state) => state.frequencyEnabled);
  const frequencyHz = usePlaybackStore((state) => state.frequencyHz);
  const eqEnabled = usePlaybackStore((state) => state.eqEnabled);
  const eqBands = usePlaybackStore((state) => state.eqBands);
  const eqPreset = usePlaybackStore((state) => state.eqPreset);
  const loudnessNormEnabled = usePlaybackStore((state) => state.loudnessNormEnabled);
  const playlists = usePlaylistStore((state) => state.playlists);
  const detectedLang = detectDeviceLanguage();
  const topPadding = useScreenTopPadding(16);
  const controller = useSettingsScreen();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFocused = useIsFocused();
  const {
    analyzeAll,
    appVersion,
    cancelAnalysis,
    cancelTransfer,
    checkForUpdates,
    exportLibrary,
    failedCount,
    handleLanguageChange,
    importLibrary,
    isAnalyzing,
    isCheckingUpdates,
    isExportingLibrary,
    isImportingLibrary,
    isPreparingUpdate,
    language,
    openExportPicker,
    openAvailableUpdate,
    setShowExportPicker,
    showExportPicker,
    progress,
    stats,
    transferProgress,
    updateResult,
    downloadQualityProfile,
    setDownloadQualityProfile,
    refreshCloudLocalState,
    refreshDownloadQuality,
    refreshLoudnessStats,
  } = controller;

  useEffect(() => {
    if (isFocused && updateResult?.hasUpdate) void markMobileUpdateSeen();
  }, [isFocused, updateResult?.hasUpdate, updateResult?.latestVersion]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
        loadPlaylists(),
        refreshCloudLocalState(),
        refreshDownloadQuality(),
        refreshLoudnessStats(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    isRefreshing,
    refreshCloudLocalState,
    refreshDownloadQuality,
    refreshLoudnessStats,
  ]);

  const updateStatusText =
    updateResult == null
      ? null
      : updateResult.hasUpdate
        ? null
        : t('upToDateMessage', { version: appVersion });
  const updateActionLabel = t(getMobileUpdateActionKey(updateResult));
  const loudnessStatsText = stats
    ? t('loudnessStats', { analyzed: stats.analyzed, total: stats.total })
    : null;
  const loudnessProgressText = progress == null
    ? null
    : progress.phase === 'queued'
      ? t('transferQueued')
      : t('loudnessAnalysisProgress', {
        current: progress.current,
        total: progress.total,
        analyzed: progress.analyzed,
        failed: progress.failed,
      });
  const loudnessFailedText = failedCount > 0
    ? t('loudnessAnalyzeFailedCount', { failed: failedCount })
    : null;
  const audioSupport = getAudioSettingsSupportSnapshot();
  const loudnessNote = audioSupport.loudness.noteKey
    ? t(audioSupport.loudness.noteKey)
    : null;

  return (
    <ScrollView
      className="flex-1 bg-bg-deep"
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={(
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => { void handleRefresh(); }}
          tintColor="#e8e8e8"
        />
      )}
    >
      <View className="px-4 pb-4" style={{ paddingTop: topPadding }}>
        <Text className="text-white text-2xl font-bold">{t('title')}</Text>
      </View>

      <SettingsGroup label={t('generalGroup')}>
        <LanguageCard
          title={t('languageSection')}
          autoLabel={t('languageAuto')}
          detectedText={t('languageDetected', { lang: '{{lang}}' })}
          language={language}
          detectedLang={detectedLang}
          onChange={handleLanguageChange}
        />
        <UpdateCard
          title={t('updateSection')}
          currentVersionLabel={t('currentVersion')}
          currentVersionValue={appVersion}
          latestVersionLabel={t('latestVersion')}
          latestVersionValue={updateResult?.latestVersion ?? null}
          checkForUpdatesLabel={t('checkForUpdates')}
          checkingForUpdatesLabel={t('checkingForUpdates')}
          preparingUpdateLabel={t('preparingUpdate')}
          updateStatusText={updateStatusText}
          isCheckingUpdates={isCheckingUpdates}
          isPreparingUpdate={isPreparingUpdate}
          canOpenUpdate={Boolean(updateResult?.hasUpdate)}
          openUpdateLabel={updateActionLabel}
          onCheckForUpdates={() => void checkForUpdates()}
          onOpenUpdate={() => void openAvailableUpdate()}
          newVersionAvailableLabel={t('newVersionAvailable')}
        />
      </SettingsGroup>

      <SettingsGroup label={t('libraryGroup')}>
        <ExportImportCard
          title={t('exportImportSection')}
          exportLabel={t('exportButton')}
          exportingLabel={t('exportingButton')}
          importLabel={t('importButton')}
          importingLabel={t('importingButton')}
          isExporting={isExportingLibrary}
          isImporting={isImportingLibrary}
          onExport={() => void openExportPicker()}
          onImport={() => void importLibrary()}
        />
      </SettingsGroup>

      <SettingsGroup label={t('downloadGroup')}>
        <DownloadQualityCard
          profile={downloadQualityProfile}
          title={t('downloadQualityTitle')}
          description={t('downloadQualityDescription')}
          warning={t('downloadQualityWarning')}
          onChange={setDownloadQualityProfile}
        />
      </SettingsGroup>

      <SettingsGroup label={t('audioGroup')}>
        <FrequencyCard
          title={t('frequencySection')}
          description={t('frequencyDescription')}
          disabled={!audioSupport.frequency.supported}
          disabledLabel={audioSupport.frequency.noteKey ? t(audioSupport.frequency.noteKey) : null}
          frequencyEnabled={frequencyEnabled}
          frequencyHz={frequencyHz}
        />
        <EqualizerCard
          title={t('eqSection')}
          description={t('eqDescription')}
          disabled={!audioSupport.equalizer.supported}
          disabledLabel={audioSupport.equalizer.noteKey ? t(audioSupport.equalizer.noteKey) : null}
          eqEnabled={eqEnabled}
          eqBands={eqBands}
          eqPreset={eqPreset}
        />
        <LoudnessCard
          analyzeAllLabel={t('loudnessAnalyzeAll')}
          analyzingLabel={t('loudnessAnalyzing')}
          cancelLabel={tc('cancel')}
          title={t('loudnessSection')}
          description={t('loudnessDescription')}
          disabled={!audioSupport.loudness.analysisSupported}
          failedLabel={loudnessFailedText}
          isAnalyzeDisabled={!audioSupport.loudness.analysisSupported || isAnalyzing || !stats || stats.missing === 0}
          isAnalyzing={isAnalyzing}
          loudnessNormEnabled={loudnessNormEnabled}
          noteLabel={loudnessNote}
          onAnalyzeAll={() => void analyzeAll()}
          onCancelAnalysis={cancelAnalysis ? () => { void cancelAnalysis(); } : null}
          progressLabel={loudnessProgressText}
          statsLabel={loudnessStatsText}
          targetLabel={t('loudnessTarget', { target: LUFS_TARGET_DEFAULT })}
        />
      </SettingsGroup>

      <SettingsConnectionsGroup controller={controller} t={t} tc={tc} />

      <SettingsGroup label={t('aboutSection')}>
        <AboutCard
          title={t('aboutVersion')}
          versionLabel={t('versionValue', { version: appVersion })}
          versionText={t('aboutAudioFormat')}
          desktopOnlyText={t('aboutDesktopOnly')}
        />
      </SettingsGroup>

      <SettingsGroup label={t('communitySection')}>
        <CommunityCard
          title={t('communityTitle')}
          description={t('communityDescription')}
          buttonLabel={t('communityButton')}
        />
      </SettingsGroup>

      <View className="items-center px-4 pt-1 pb-6">
        <Text className="text-text-secondary text-xs text-center">by NaMarrado</Text>
        <Pressable
          onPress={() => void Linking.openURL('https://linktr.ee/namarrado')}
          className="mt-1.5"
        >
          <Text className="text-[#9b9b9b] text-[11px] text-center">linktr.ee/namarrado</Text>
        </Pressable>
      </View>

      <ExportSelectionModal
        visible={showExportPicker}
        playlists={playlists}
        busy={isExportingLibrary}
        onClose={() => setShowExportPicker(false)}
        onConfirm={(selection) => {
          setShowExportPicker(false);
          void exportLibrary(selection);
        }}
      />

      <LibraryTransferProgressModal
        visible={transferProgress != null}
        title={transferProgress?.title ?? t('exportImportSection')}
        message={transferProgress?.message ?? t('transferPreparing')}
        progress={transferProgress && transferProgress.total > 0
          ? Math.min(100, Math.round((transferProgress.current / transferProgress.total) * 100))
          : null}
        canCancel={Boolean(transferProgress?.cancel)}
        cancelLabel={tc('cancel')}
        onCancel={() => { void cancelTransfer(); }}
      />
    </ScrollView>
  );
}
