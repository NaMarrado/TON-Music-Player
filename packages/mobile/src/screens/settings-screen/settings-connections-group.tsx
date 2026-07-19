import { formatSize } from '@ton/core';
import { SettingsGroup } from './primitives';
import { SpotifyCard } from './spotify-card';
import { CloudCard } from './cloud-card';
import type { useSettingsScreen } from './use-settings-screen';

type Translator = (key: string, options?: Record<string, unknown>) => string;
type SettingsController = ReturnType<typeof useSettingsScreen>;

export function SettingsConnectionsGroup({
  controller,
  t,
  tc,
}: {
  controller: SettingsController;
  t: Translator;
  tc: Translator;
}) {
  const {
    cancelCloudTask,
    cloudAutoSyncDetailsLabel,
    cloudAutoSyncEnabled,
    cloudAudioOverCellular,
    cloudAutoSyncStatusLabel,
    cloudBusy,
    cloudCanRun,
    cloudConnectedLabel,
    cloudCleanupChecking,
    cloudCleanupPreview,
    cloudCleanupStatus,
    cloudError,
    cloudForm,
    cloudHasSecret,
    cloudLoaded,
    cloudProgress,
    cloudProgressLabel,
    cloudResult,
    cloudResultLabel,
    loadCloudConfig,
    prepareCloudCleanup,
    prepareCloudSync,
    runCloudCleanup,
    loadSpotifyCreds,
    saveAndTestCloud,
    saveSpotifyCreds,
    setSpotifyId,
    setSpotifySecret,
    spotifyId,
    spotifyLoaded,
    spotifySecret,
    syncCloud,
    toggleCloudAutoSync,
    toggleCloudAudioOverCellular,
    updateCloudForm,
    uploadCloudMissing,
  } = controller;

  return (
    <SettingsGroup label={t('connectionsGroup')}>
      <SpotifyCard
        title={t('spotifySection')}
        description={t('spotifyDescription')}
        tapToEditLabel={t('spotifyTapToEdit')}
        spotifyIdLabel={t('spotifyId')}
        spotifyIdPlaceholder={t('spotifyIdPlaceholder')}
        spotifySecretLabel={t('spotifySecret')}
        spotifySecretPlaceholder={t('spotifySecretPlaceholder')}
        saveLabel={tc('save')}
        helpTitle={t('spotifyHelpTitle')}
        helpSteps={Array.from({ length: 6 }, (_, index) => t(`spotifyHelpStep${index + 1}`))}
        spotifyLoaded={spotifyLoaded}
        spotifyId={spotifyId}
        spotifySecret={spotifySecret}
        onLoad={loadSpotifyCreds}
        onSave={saveSpotifyCreds}
        onSpotifyIdChange={setSpotifyId}
        onSpotifySecretChange={setSpotifySecret}
      />
      <CloudCard
        autoSyncDescription={cloudAutoSyncEnabled
          ? t('cloudAutoSyncEnabledDescription')
          : t('cloudAutoSyncDisabledDescription')}
        autoSyncDetailsLabel={cloudAutoSyncDetailsLabel}
        autoSyncEnabled={cloudAutoSyncEnabled}
        autoSyncLabel={t('cloudAutoSync')}
        autoSyncStatusLabel={cloudAutoSyncStatusLabel}
        audioOverCellularDescription={t('cloudAudioOverCellularDescription')}
        audioOverCellularEnabled={cloudAudioOverCellular}
        audioOverCellularLabel={t('cloudAudioOverCellular')}
        canRun={cloudCanRun}
        connectedLabel={cloudConnectedLabel}
        cleanupChecking={cloudCleanupChecking}
        cleanupPreview={cloudCleanupPreview}
        cleanupStatus={cloudCleanupStatus}
        description={t('cloudDescription')}
        failedLabel={cloudError}
        formatCleanupPlaylistChange={(removed, remaining) => t('cloudCleanupPlaylistRemoved', {
          removed,
          remaining,
        })}
        formatSyncRestoreDeleted={(count) => t('cloudSyncRestoreDeleted', { count })}
        form={cloudForm}
        hasSecret={cloudHasSecret}
        helpTitle={t('cloudHelpTitle')}
        helpSteps={Array.from({ length: 10 }, (_, index) => t(`cloudHelpStep${index + 1}`))}
        isBusy={cloudBusy}
        loaded={cloudLoaded}
        loadLabel={t('cloudTapToEdit')}
        progress={cloudProgress}
        progressLabel={cloudProgressLabel}
        result={cloudResult}
        resultLabel={cloudResultLabel}
        labels={{
          accountId: t('cloudAccountId'),
          bucket: t('cloudBucket'),
          prefix: t('cloudPrefix'),
          jurisdiction: t('cloudJurisdiction'),
          jurisdiction_default: t('cloudJurisdictionDefault'),
          jurisdiction_eu: t('cloudJurisdictionEu'),
          jurisdiction_fedramp: t('cloudJurisdictionFedramp'),
          accessKeyId: t('cloudAccessKeyId'),
          secretAccessKey: t('cloudSecretAccessKey'),
          secretStored: t('cloudSecretStored'),
          saveTest: t('cloudSaveTest'),
          uploadMissing: t('cloudUploadMissing'),
          syncNow: t('cloudSyncNow'),
          syncDialogTitle: t('cloudSyncDialogTitle'),
          syncDialogDescription: t('cloudSyncDialogDescription'),
          syncConfirm: t('cloudSyncConfirm'),
          cancel: tc('cancel'),
          working: t('cloudWorking'),
          cleanupSectionTitle: t('cloudCleanupSectionTitle'),
          cleanupDescription: t('cloudCleanupDescription'),
          cleanupChecking: t('cloudCleanupChecking'),
          cleanupClean: t('cloudCleanupClean'),
          cleanupAnalyze: t('cloudCleanupAnalyze'),
          cleanupButton: cloudCleanupPreview ? t('cloudCleanupButton', {
            count: cloudCleanupPreview.cloudOnlyTracks,
            size: formatSize(cloudCleanupPreview.reclaimableBytes),
          }) : t('cloudCleanupClean'),
          cleanupTitle: t('cloudCleanupTitle'),
          cleanupSongs: t('cloudCleanupSongs', { count: cloudCleanupPreview?.cloudOnlyTracks ?? 0 }),
          cleanupPlaylists: t('cloudCleanupPlaylists', { count: cloudCleanupPreview?.affectedPlaylists ?? 0 }),
          cleanupSpace: t('cloudCleanupSpace', { size: formatSize(cloudCleanupPreview?.reclaimableBytes ?? 0) }),
          cleanupWarning: t('cloudCleanupWarning'),
          cleanupConfirm: t('cloudCleanupConfirm', { count: cloudCleanupPreview?.cloudOnlyTracks ?? 0 }),
          cleanupTrackLabel: t('cloudCleanupTrackLabel'),
          cleanupPlaylistLabel: t('cloudCleanupPlaylistLabel'),
          cleanupFailureLabel: t('cloudCleanupFailureLabel'),
          cleanupUnknownTrack: t('cloudCleanupUnknownTrack'),
        }}
        onCancel={cancelCloudTask}
        onCleanup={runCloudCleanup}
        onPrepareCleanup={prepareCloudCleanup}
        onLoad={loadCloudConfig}
        onPrepareSync={async () => {
          const preview = await prepareCloudSync();
          return preview;
        }}
        onSaveTest={saveAndTestCloud}
        onSync={syncCloud}
        onToggleAutoSync={(enabled) => { void toggleCloudAutoSync(enabled); }}
        onToggleAudioOverCellular={(enabled) => {
          void toggleCloudAudioOverCellular(enabled);
        }}
        onUpdate={updateCloudForm}
        onUpload={uploadCloudMissing}
        title={t('cloudSection')}
      />
    </SettingsGroup>
  );
}
