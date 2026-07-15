import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CloudAutoSyncStatus,
  CloudR2CleanupPreview,
  CloudR2CleanupResult,
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudSyncProgress,
  CloudSyncResult,
} from '@ton/core';
import { formatSize } from '@ton/core';
import { reconcileLibraryTracks } from '../../stores/library-store';
import { reloadPlaylistViews } from '../../stores/playlist-store';
import { SectionHeader, ToggleSwitch } from './helpers';
import type { SettingsLayout } from './use-settings-layout';
import { EMPTY_CLOUD_FORM, type CloudFormState, type Translator } from './cloud-section-types';
import {
  CloudActionButton,
  CloudAutoSyncSummary,
  CloudCleanupDialog,
  CloudField,
  CloudHelpButton,
  CloudHelpDialog,
} from './cloud-section-components';
import {
  formatCloudAutoSyncTime,
  formatCloudError,
  formatCloudProgress,
  toCloudForm,
} from './cloud-section-utils';

interface CloudSectionProps {
  layout: SettingsLayout;
  t: Translator;
}

export function CloudSection({ layout, t }: CloudSectionProps) {
  const [form, setForm] = useState<CloudFormState>(EMPTY_CLOUD_FORM);
  const [hasSecret, setHasSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<CloudSyncProgress | null>(null);
  const [result, setResult] = useState<CloudSyncResult | null>(null);
  const [autoSyncStatus, setAutoSyncStatus] = useState<CloudAutoSyncStatus | null>(null);
  const [autoSyncBusy, setAutoSyncBusy] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<CloudR2CleanupPreview | null>(null);
  const [cleanupChecking, setCleanupChecking] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);

  useEffect(() => {
    void Promise.all([
      window.api.invoke('cloud:get-config'),
      window.api.invoke('cloud:get-auto-sync-status'),
    ]).then(async ([config, syncStatus]) => {
      setForm(toCloudForm(config));
      setHasSecret(Boolean(config?.hasSecretAccessKey));
      setAutoSyncStatus(syncStatus);
      if (config) {
        setCleanupChecking(true);
        try {
          setCleanupPreview(await window.api.invoke('cloud:preview-cleanup'));
        } catch (error) {
          setStatus(formatCloudError(error, t));
        } finally {
          setCleanupChecking(false);
          setProgress(null);
        }
      }
    });
  }, [t]);

  useEffect(() => {
    const handler = (payload: unknown) => {
      setProgress(payload as CloudSyncProgress);
    };
    window.api.on('cloud:progress', handler);
    return () => window.api.off('cloud:progress', handler);
  }, []);

  useEffect(() => {
    const handler = (payload: unknown) => {
      setAutoSyncStatus(payload as CloudAutoSyncStatus);
    };
    window.api.on('cloud:state', handler);
    return () => window.api.off('cloud:state', handler);
  }, []);

  const canRun = useMemo(() => (
    Boolean(form.accountId && form.bucket && form.accessKeyId && (form.secretAccessKey || hasSecret))
  ), [form.accountId, form.accessKeyId, form.bucket, form.secretAccessKey, hasSecret]);

  const buildConfig = useCallback((): CloudStorageConfig => ({
    accountId: form.accountId,
    bucket: form.bucket,
    prefix: form.prefix || 'ton',
    accessKeyId: form.accessKeyId,
    secretAccessKey: form.secretAccessKey,
    jurisdiction: form.jurisdiction,
  }), [form]);

  const saveAndTest = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    setResult(null);
    setProgress({ phase: 'testing', current: 0, total: 1, uploaded: 0, downloaded: 0, skipped: 0, failed: 0 });
    try {
      const saved = await window.api.invoke('cloud:save-config', buildConfig());
      setHasSecret(saved.hasSecretAccessKey);
      setForm(toCloudForm(saved));
      await window.api.invoke('cloud:test-config');
      setAutoSyncStatus(await window.api.invoke('cloud:get-auto-sync-status'));
      setStatus(t('cloudConnected'));
      setProgress(null);
      setCleanupChecking(true);
      setCleanupPreview(await window.api.invoke('cloud:preview-cleanup'));
    } catch (error) {
      setStatus(formatCloudError(error, t));
      setProgress(null);
    } finally {
      setBusy(false);
      setCleanupChecking(false);
    }
  }, [buildConfig, t]);

  const executeCleanup = useCallback(async () => {
    if (!cleanupPreview) return;
    setBusy(true);
    setStatus(null);
    setResult(null);
    try {
      const cleanupResult = await window.api.invoke(
        'cloud:execute-cleanup', cleanupPreview.previewToken,
      ) as CloudR2CleanupResult | null;
      if (!cleanupResult) {
        setStatus(t('cloudCancelled'));
        setShowCleanup(false);
        return;
      }
      if (cleanupResult.status === 'stale' && cleanupResult.refreshedPreview) {
        setCleanupPreview(cleanupResult.refreshedPreview);
        setStatus(t('cloudCleanupStale'));
        return;
      }
      setShowCleanup(false);
      setStatus(t('cloudCleanupDone', {
        songs: cleanupResult.deletedTracks,
        objects: cleanupResult.deletedObjects,
        failed: cleanupResult.failedObjects,
        size: formatSize(cleanupResult.freedBytes),
      }));
      setCleanupChecking(true);
      setCleanupPreview(await window.api.invoke('cloud:preview-cleanup'));
    } catch (error) {
      setStatus(formatCloudError(error, t));
    } finally {
      setBusy(false);
      setCleanupChecking(false);
      setProgress(null);
    }
  }, [cleanupPreview, t]);

  const toggleAutoSync = useCallback(async () => {
    if (!autoSyncStatus || autoSyncBusy) {
      return;
    }
    setAutoSyncBusy(true);
    try {
      const nextStatus = await window.api.invoke(
        'cloud:set-auto-sync-enabled',
        !autoSyncStatus.enabled,
      );
      setAutoSyncStatus(nextStatus);
    } catch (error) {
      setStatus(formatCloudError(error, t));
    } finally {
      setAutoSyncBusy(false);
    }
  }, [autoSyncBusy, autoSyncStatus, t]);

  const runTask = useCallback(async (
    task: 'cloud:upload-missing' | 'cloud:fetch-library' | 'cloud:sync-now',
  ) => {
    setBusy(true);
    setStatus(null);
    setResult(null);
    setProgress(null);
    try {
      const taskResult = await window.api.invoke(task);
      if (taskResult && task !== 'cloud:upload-missing') {
        await Promise.all([
          reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
          reloadPlaylistViews(),
        ]);
      }
      if (taskResult) {
        setCleanupChecking(true);
        setCleanupPreview(await window.api.invoke('cloud:preview-cleanup'));
      }
      setResult(taskResult as CloudSyncResult | null);
      setStatus(taskResult ? t('cloudDone') : t('cloudCancelled'));
    } catch (error) {
      setStatus(formatCloudError(error, t));
    } finally {
      setBusy(false);
      setCleanupChecking(false);
      setProgress(null);
    }
  }, [t]);

  const progressText = formatCloudProgress(progress, result, t);
  const lastSuccessText = formatCloudAutoSyncTime(autoSyncStatus?.lastSuccessAt ?? null);
  const nextRetryText = formatCloudAutoSyncTime(autoSyncStatus?.nextRetryAt ?? null);

  return (
    <div>
      <SectionHeader
        compact={layout.compact}
        icon={<span style={{ fontSize: '0.9rem' }}>R2</span>}
        title={
          <span className="flex items-center gap-2">
            {t('cloudSection')}
            <CloudHelpButton title={t('cloudHelpTitle')} onClick={() => setShowHelp(true)} />
          </span>
        }
        description={t('cloudDescription')}
        right={(
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem' }}>
              {t('cloudAutoSync')}
            </span>
            <ToggleSwitch
              disabled={!autoSyncStatus || autoSyncBusy}
              enabled={autoSyncStatus?.enabled ?? true}
              onClick={() => void toggleAutoSync()}
            />
          </div>
        )}
      />
      {showHelp && <CloudHelpDialog t={t} onClose={() => setShowHelp(false)} />}
      {showCleanup && cleanupPreview && (
        <CloudCleanupDialog
          busy={busy}
          formatSize={formatSize}
          onAbort={() => void window.api.invoke('cloud:cancel')}
          onCancel={() => setShowCleanup(false)}
          onConfirm={() => void executeCleanup()}
          preview={cleanupPreview}
          t={t}
        />
      )}
      <div className="flex flex-col gap-3" style={{ paddingLeft: layout.sectionIndent }}>
        {autoSyncStatus && (
          <CloudAutoSyncSummary
            lastSuccessText={lastSuccessText}
            nextRetryText={nextRetryText}
            status={autoSyncStatus}
            t={t}
          />
        )}
        {progressText && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
            {progressText}
          </p>
        )}
        {status && (
          <p style={{ color: status === t('cloudConnected') || status === t('cloudDone') ? 'var(--white)' : 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
            {status}
          </p>
        )}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: layout.compact ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}
        >
          <CloudField label={t('cloudAccountId')} value={form.accountId} onChange={(value) => setForm((state) => ({ ...state, accountId: value }))} />
          <CloudField label={t('cloudBucket')} value={form.bucket} onChange={(value) => setForm((state) => ({ ...state, bucket: value }))} />
          <CloudField label={t('cloudPrefix')} value={form.prefix} onChange={(value) => setForm((state) => ({ ...state, prefix: value }))} placeholder="ton" />
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px', letterSpacing: '0.04em' }}>
              {t('cloudJurisdiction')}
            </span>
            <select
              value={form.jurisdiction}
              onChange={(event) => setForm((state) => ({ ...state, jurisdiction: event.target.value as CloudStorageJurisdiction }))}
              style={{
                width: '100%',
                background: 'var(--bg-deep)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '9px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.82rem',
              }}
            >
              <option value="default">{t('cloudJurisdictionDefault')}</option>
              <option value="eu">{t('cloudJurisdictionEu')}</option>
              <option value="fedramp">{t('cloudJurisdictionFedramp')}</option>
            </select>
          </label>
          <CloudField label={t('cloudAccessKeyId')} value={form.accessKeyId} onChange={(value) => setForm((state) => ({ ...state, accessKeyId: value }))} />
          <CloudField
            label={t('cloudSecretAccessKey')}
            value={form.secretAccessKey}
            onChange={(value) => setForm((state) => ({ ...state, secretAccessKey: value }))}
            placeholder={hasSecret ? t('cloudSecretStored') : undefined}
            type="password"
          />
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: layout.compact ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}
        >
          <CloudActionButton primary disabled={busy || !canRun} onClick={() => void saveAndTest()}>
            {busy ? t('cloudWorking') : t('cloudSaveTest')}
          </CloudActionButton>
          <CloudActionButton disabled={busy || !canRun} onClick={() => void runTask('cloud:upload-missing')}>
            {t('cloudUploadMissing')}
          </CloudActionButton>
          <CloudActionButton disabled={busy || !canRun} onClick={() => void runTask('cloud:fetch-library')}>
            {t('cloudFetchLibrary')}
          </CloudActionButton>
          <CloudActionButton disabled={busy || !canRun} onClick={() => void runTask('cloud:sync-now')}>
            {t('cloudSyncNow')}
          </CloudActionButton>
          <CloudActionButton disabled={!busy} onClick={() => void window.api.invoke('cloud:cancel')}>
            {t('cloudCancel')}
          </CloudActionButton>
        </div>
        <div
          style={{
            marginTop: '6px',
            padding: '14px',
            border: '1px solid rgba(239, 68, 68, 0.55)',
            borderRadius: 'var(--radius)',
            background: 'rgba(239, 68, 68, 0.06)',
          }}
        >
          <p style={{ color: '#f87171', fontSize: '0.82rem', fontWeight: 600 }}>
            {t('cloudCleanupSectionTitle')}
          </p>
          <p style={{
            color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.55,
            margin: '5px 0 12px',
          }}>
            {t('cloudCleanupDescription')}
          </p>
          <CloudActionButton
            danger
            disabled={busy || cleanupChecking || !cleanupPreview
              || (cleanupPreview.cloudOnlyTracks === 0 && cleanupPreview.objectsToDelete === 0)}
            onClick={() => setShowCleanup(true)}
          >
            {cleanupChecking
              ? t('cloudCleanupChecking')
              : cleanupPreview && (cleanupPreview.cloudOnlyTracks > 0 || cleanupPreview.objectsToDelete > 0)
                ? t('cloudCleanupButton', {
                  count: cleanupPreview.cloudOnlyTracks,
                  size: formatSize(cleanupPreview.reclaimableBytes),
                })
                : t('cloudCleanupClean')}
          </CloudActionButton>
        </div>
      </div>
    </div>
  );
}
