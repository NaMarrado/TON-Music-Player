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
    cloudAutoSyncStatusLabel,
    cloudBusy,
    cloudCanRun,
    cloudConnectedLabel,
    cloudError,
    cloudForm,
    cloudHasSecret,
    cloudLoaded,
    cloudProgress,
    cloudProgressLabel,
    cloudResult,
    cloudResultLabel,
    fetchCloud,
    loadCloudConfig,
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
        canRun={cloudCanRun}
        connectedLabel={cloudConnectedLabel}
        description={t('cloudDescription')}
        failedLabel={cloudError}
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
          fetchLibrary: t('cloudFetchLibrary'),
          syncNow: t('cloudSyncNow'),
          cancel: tc('cancel'),
          working: t('cloudWorking'),
        }}
        onCancel={cancelCloudTask}
        onFetch={fetchCloud}
        onLoad={loadCloudConfig}
        onSaveTest={saveAndTestCloud}
        onSync={syncCloud}
        onToggleAutoSync={(enabled) => { void toggleCloudAutoSync(enabled); }}
        onUpdate={updateCloudForm}
        onUpload={uploadCloudMissing}
        title={t('cloudSection')}
      />
    </SettingsGroup>
  );
}
