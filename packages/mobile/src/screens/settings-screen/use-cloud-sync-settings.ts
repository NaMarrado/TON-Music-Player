import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudR2CleanupPreview,
  CloudSyncProgress,
  CloudSyncResult,
} from '@ton/core';
import { formatSize, normalizeCloudStorageErrorKey } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  getMobileCloudSyncConfig,
  executeCloudCleanup,
  previewCloudCleanup,
  saveMobileCloudSyncConfig,
  testMobileCloudConnection,
} from '../../services/cloud-sync';
import {
  cancelMobileCloudAutoSyncRun,
  getMobileCloudAutoSyncStatus,
  notifyMobileCloudConfigChanged,
  runMobileCloudManualTask,
  setMobileCloudAutoSyncEnabled,
  subscribeMobileCloudAutoSyncStatus,
} from '../../services/cloud-sync/auto-sync';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { loadPlaylists } from '../../stores/playlist-store';

type CloudForm = {
  accountId: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction: CloudStorageJurisdiction;
};

const EMPTY_FORM: CloudForm = {
  accountId: '',
  bucket: '',
  prefix: 'ton',
  accessKeyId: '',
  secretAccessKey: '',
  jurisdiction: 'default',
};

function formatCloudError(error: unknown, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!(error instanceof Error)) {
    return t('cloudFailed');
  }
  const errorKey = normalizeCloudStorageErrorKey(error.message);
  if (errorKey) {
    return t(errorKey);
  }
  if (error.message.startsWith('cloud_cleanup_')) return t(error.message);
  return error.message || t('cloudFailed');
}

export function useCloudSyncSettings() {
  const { t } = useTranslation('settings');
  const [cloudForm, setCloudForm] = useState<CloudForm>(EMPTY_FORM);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [cloudHasSecret, setCloudHasSecret] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudProgress, setCloudProgress] = useState<CloudSyncProgress | null>(null);
  const [cloudResult, setCloudResult] = useState<CloudSyncResult | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [cloudCleanupPreview, setCloudCleanupPreview] = useState<CloudR2CleanupPreview | null>(null);
  const [cloudCleanupChecking, setCloudCleanupChecking] = useState(false);
  const [cloudCleanupStatus, setCloudCleanupStatus] = useState<string | null>(null);
  const [cloudAutoSyncStatus, setCloudAutoSyncStatus] = useState(
    getMobileCloudAutoSyncStatus,
  );

  const updateCloudForm = useCallback((patch: Partial<CloudForm>) => {
    setCloudForm((state) => ({ ...state, ...patch }));
  }, []);

  useEffect(() => subscribeMobileCloudAutoSyncStatus(setCloudAutoSyncStatus), []);

  const refreshCloudCleanupPreview = useCallback(async () => {
    setCloudCleanupChecking(true);
    try {
      setCloudCleanupPreview(await previewCloudCleanup());
    } catch (error) {
      setCloudError(formatCloudError(error, t));
    } finally {
      setCloudCleanupChecking(false);
      setCloudProgress(null);
    }
  }, [t]);

  const loadCloudConfig = useCallback(async () => {
    if (cloudLoaded) {
      return;
    }
    const config = await getMobileCloudSyncConfig();
    if (config) {
      setCloudForm({
        accountId: config.accountId,
        bucket: config.bucket,
        prefix: config.prefix || 'ton',
        accessKeyId: config.accessKeyId,
        secretAccessKey: '',
        jurisdiction: config.jurisdiction,
      });
      setCloudHasSecret(config.hasSecretAccessKey);
      void refreshCloudCleanupPreview();
    }
    setCloudLoaded(true);
  }, [cloudLoaded, refreshCloudCleanupPreview]);

  const buildConfig = useCallback((): CloudStorageConfig => ({
    accountId: cloudForm.accountId,
    bucket: cloudForm.bucket,
    prefix: cloudForm.prefix || 'ton',
    accessKeyId: cloudForm.accessKeyId,
    secretAccessKey: cloudForm.secretAccessKey,
    jurisdiction: cloudForm.jurisdiction,
  }), [cloudForm]);

  const saveAndTestCloud = useCallback(async () => {
    setCloudBusy(true);
    setCloudError(null);
    setCloudConnected(false);
    setCloudResult(null);
    setCloudProgress({ phase: 'testing', current: 0, total: 1, uploaded: 0, downloaded: 0, skipped: 0, failed: 0 });
    try {
      // Stop a run bound to the previous bucket/prefix before credentials are
      // replaced, so it cannot apply the old scope after this save.
      cancelMobileCloudAutoSyncRun();
      const saved = await saveMobileCloudSyncConfig(buildConfig());
      setCloudHasSecret(saved.hasSecretAccessKey);
      setCloudForm({
        accountId: saved.accountId,
        bucket: saved.bucket,
        prefix: saved.prefix || 'ton',
        accessKeyId: saved.accessKeyId,
        secretAccessKey: '',
        jurisdiction: saved.jurisdiction,
      });
      await notifyMobileCloudConfigChanged();
      await testMobileCloudConnection();
      setCloudConnected(true);
      await refreshCloudCleanupPreview();
    } catch (error) {
      setCloudError(formatCloudError(error, t));
    } finally {
      setCloudProgress(null);
      setCloudBusy(false);
    }
  }, [buildConfig, refreshCloudCleanupPreview, t]);

  const runCloudCleanup = useCallback(async (): Promise<'completed' | 'stale' | 'cancelled'> => {
    if (!cloudCleanupPreview) return 'cancelled';
    setCloudBusy(true);
    setCloudError(null);
    setCloudCleanupStatus(null);
    setCloudConnected(false);
    setCloudResult(null);
    setCloudProgress(null);
    try {
      const result = await executeCloudCleanup(
        cloudCleanupPreview.previewToken,
        (progress) => setCloudProgress(progress),
      );
      if (result.status === 'stale' && result.refreshedPreview) {
        setCloudCleanupPreview(result.refreshedPreview);
        setCloudCleanupStatus(t('cloudCleanupStale'));
        return 'stale';
      }
      setCloudCleanupStatus(t('cloudCleanupDone', {
        songs: result.deletedTracks,
        objects: result.deletedObjects,
        failed: result.failedObjects,
        size: formatSize(result.freedBytes),
      }));
      await refreshCloudCleanupPreview();
      return 'completed';
    } catch (error) {
      if (error instanceof Error && error.message === 'cloud_sync_cancelled') {
        setCloudCleanupStatus(t('cloudCancelled'));
        return 'cancelled';
      }
      setCloudError(formatCloudError(error, t));
      return 'cancelled';
    } finally {
      setCloudBusy(false);
      setCloudProgress(null);
    }
  }, [cloudCleanupPreview, refreshCloudCleanupPreview, t]);

  const runCloudTask = useCallback(async (
    task: 'upload' | 'fetch' | 'sync',
  ) => {
    let keepProgress = false;
    setCloudBusy(true);
    setCloudError(null);
    setCloudConnected(false);
    setCloudResult(null);
    setCloudProgress(null);
    try {
      const onProgress = (progress: CloudSyncProgress) => setCloudProgress(progress);
      const result = await runMobileCloudManualTask(task, onProgress);
      setCloudResult(result);
      if (!result) {
        keepProgress = true;
        setCloudProgress({ phase: 'cancelled', current: 0, total: 0, uploaded: 0, downloaded: 0, skipped: 0, failed: 0 });
      }
      if (result && task !== 'upload') {
        await Promise.all([
          reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
          loadPlaylists(),
        ]);
      }
      if (result) {
        await refreshCloudCleanupPreview();
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'cloud_sync_cancelled') {
        keepProgress = true;
        setCloudProgress({ phase: 'cancelled', current: 0, total: 0, uploaded: 0, downloaded: 0, skipped: 0, failed: 0 });
      } else {
        setCloudError(formatCloudError(error, t));
      }
    } finally {
      setCloudBusy(false);
      if (!keepProgress) {
        setCloudProgress(null);
      }
    }
  }, [refreshCloudCleanupPreview, t]);

  const cancelCloudTask = useCallback(() => {
    cancelMobileCloudAutoSyncRun();
  }, []);

  const toggleCloudAutoSync = useCallback(async (enabled: boolean) => {
    setCloudError(null);
    try {
      await setMobileCloudAutoSyncEnabled(enabled);
    } catch (error) {
      setCloudError(formatCloudError(error, t));
    }
  }, [t]);

  const cloudCanRun = Boolean(
    cloudForm.accountId
    && cloudForm.bucket
    && cloudForm.accessKeyId
    && (cloudForm.secretAccessKey || cloudHasSecret),
  );

  const displayedCloudProgress = cloudProgress ?? cloudAutoSyncStatus.progress ?? null;

  const cloudProgressLabel = useMemo(() => {
    if (!displayedCloudProgress) {
      return null;
    }
    return t('cloudProgress', {
      phase: t(`cloudPhase_${displayedCloudProgress.phase}`),
      current: displayedCloudProgress.current,
      total: displayedCloudProgress.total,
      uploaded: displayedCloudProgress.uploaded,
      downloaded: displayedCloudProgress.downloaded,
      skipped: displayedCloudProgress.skipped,
      failed: displayedCloudProgress.failed,
    });
  }, [displayedCloudProgress, t]);

  const cloudResultLabel = useMemo(() => {
    if (!cloudResult) {
      return null;
    }
    return t('cloudResult', {
      uploaded: cloudResult.uploaded,
      downloaded: cloudResult.downloaded,
      skipped: cloudResult.skipped,
      playlists: cloudResult.importedPlaylists,
    });
  }, [cloudResult, t]);

  const cloudAutoSyncStatusLabel = useMemo(() => {
    const state = t(`cloudAutoSyncState_${cloudAutoSyncStatus.state}`);
    if (!cloudAutoSyncStatus.lastErrorKey) {
      return state;
    }
    return `${state}: ${t(cloudAutoSyncStatus.lastErrorKey, {
      defaultValue: cloudAutoSyncStatus.lastErrorKey,
    })}`;
  }, [cloudAutoSyncStatus.lastErrorKey, cloudAutoSyncStatus.state, t]);

  const cloudAutoSyncDetailsLabel = useMemo(() => {
    const lastSuccess = cloudAutoSyncStatus.lastSuccessAt == null
      ? '—'
      : new Date(
        cloudAutoSyncStatus.lastSuccessAt < 10_000_000_000
          ? cloudAutoSyncStatus.lastSuccessAt * 1000
          : cloudAutoSyncStatus.lastSuccessAt,
      ).toLocaleString();
    const nextRetry = cloudAutoSyncStatus.nextRetryAt == null
      ? '—'
      : new Date(
        cloudAutoSyncStatus.nextRetryAt < 10_000_000_000
          ? cloudAutoSyncStatus.nextRetryAt * 1000
          : cloudAutoSyncStatus.nextRetryAt,
      ).toLocaleString();
    return t('cloudAutoSyncDetails', {
      pendingChanges: cloudAutoSyncStatus.pendingChanges,
      pendingDownloads: cloudAutoSyncStatus.pendingDownloads,
      lastSuccess,
      nextRetry,
    });
  }, [cloudAutoSyncStatus, t]);

  return {
    cancelCloudTask,
    cloudCanRun,
    cloudConnectedLabel: cloudConnected ? t('cloudConnected') : null,
    cloudCleanupChecking,
    cloudCleanupPreview,
    cloudCleanupStatus,
    cloudAutoSyncDetailsLabel,
    cloudAutoSyncEnabled: cloudAutoSyncStatus.enabled,
    cloudAutoSyncStatusLabel,
    cloudError,
    cloudForm,
    cloudHasSecret,
    cloudLoaded,
    cloudBusy,
    cloudProgress: displayedCloudProgress,
    cloudProgressLabel,
    cloudResult,
    cloudResultLabel,
    fetchCloud: () => void runCloudTask('fetch'),
    loadCloudConfig,
    runCloudCleanup,
    saveAndTestCloud,
    syncCloud: () => void runCloudTask('sync'),
    toggleCloudAutoSync,
    updateCloudForm,
    uploadCloudMissing: () => void runCloudTask('upload'),
  };
}
