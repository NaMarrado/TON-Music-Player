import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudSyncProgress,
  CloudSyncResult,
} from '@ton/core';
import { normalizeCloudStorageErrorKey } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  getMobileCloudSyncConfig,
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
  const [cloudAutoSyncStatus, setCloudAutoSyncStatus] = useState(
    getMobileCloudAutoSyncStatus,
  );

  const updateCloudForm = useCallback((patch: Partial<CloudForm>) => {
    setCloudForm((state) => ({ ...state, ...patch }));
  }, []);

  useEffect(() => subscribeMobileCloudAutoSyncStatus(setCloudAutoSyncStatus), []);

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
    }
    setCloudLoaded(true);
  }, [cloudLoaded]);

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
    } catch (error) {
      setCloudError(formatCloudError(error, t));
    } finally {
      setCloudProgress(null);
      setCloudBusy(false);
    }
  }, [buildConfig, t]);

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
  }, [t]);

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

  const cloudProgressLabel = useMemo(() => {
    if (!cloudProgress) {
      return null;
    }
    return t('cloudProgress', {
      phase: t(`cloudPhase_${cloudProgress.phase}`),
      current: cloudProgress.current,
      total: cloudProgress.total,
      uploaded: cloudProgress.uploaded,
      downloaded: cloudProgress.downloaded,
      skipped: cloudProgress.skipped,
      failed: cloudProgress.failed,
    });
  }, [cloudProgress, t]);

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
    cloudAutoSyncDetailsLabel,
    cloudAutoSyncEnabled: cloudAutoSyncStatus.enabled,
    cloudAutoSyncStatusLabel,
    cloudError,
    cloudForm,
    cloudHasSecret,
    cloudLoaded,
    cloudBusy,
    cloudProgress,
    cloudProgressLabel,
    cloudResult,
    cloudResultLabel,
    fetchCloud: () => void runCloudTask('fetch'),
    loadCloudConfig,
    saveAndTestCloud,
    syncCloud: () => void runCloudTask('sync'),
    toggleCloudAutoSync,
    updateCloudForm,
    uploadCloudMissing: () => void runCloudTask('upload'),
  };
}
