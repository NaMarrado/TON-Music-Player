import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CloudStorageConfig,
  CloudStorageJurisdiction,
  CloudStoragePublicConfig,
  CloudSyncProgress,
  CloudSyncResult,
} from '@ton/core';
import { normalizeCloudStorageErrorKey } from '@ton/core';
import { Dialog } from '../../components/ui/dialog';
import { SectionHeader } from './helpers';
import type { SettingsLayout } from './use-settings-layout';

type Translator = (key: string, opts?: Record<string, unknown>) => string;

interface CloudSectionProps {
  layout: SettingsLayout;
  t: Translator;
}

type CloudFormState = {
  accountId: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction: CloudStorageJurisdiction;
};

const EMPTY_FORM: CloudFormState = {
  accountId: '',
  bucket: '',
  prefix: 'ton',
  accessKeyId: '',
  secretAccessKey: '',
  jurisdiction: 'default',
};

function Field({
  label,
  onChange,
  placeholder,
  type = 'text',
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'password' | 'text';
  value: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span
        style={{
          display: 'block',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          marginBottom: '4px',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <input
        type={type}
        className="w-full outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          background: 'var(--bg-deep)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '9px 12px',
          color: 'var(--text-primary)',
          fontFamily: 'inherit',
          fontSize: '0.82rem',
        }}
      />
    </label>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      className={`${primary ? 'play-all-btn' : 'preset-btn'} cursor-pointer`}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: '16px',
        background: primary ? 'var(--white)' : 'transparent',
        color: primary ? 'var(--bg-deep)' : 'var(--text-secondary)',
        border: primary ? 'none' : '1px solid var(--border)',
        fontSize: '0.78rem',
        fontWeight: 500,
        fontFamily: 'inherit',
        opacity: disabled ? 0.5 : 1,
        width: '100%',
      }}
    >
      {children}
    </button>
  );
}

function HelpButton({
  onClick,
  title,
}: {
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className="download-btn cursor-pointer flex items-center justify-center"
      onClick={onClick}
      title={title}
      style={{
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--white)',
        fontSize: '0.7rem',
        fontWeight: 600,
        fontFamily: 'inherit',
        padding: 0,
        transition: 'all var(--transition)',
      }}
    >
      ?
    </button>
  );
}

function CloudHelpDialog({
  onClose,
  t,
}: {
  onClose: () => void;
  t: Translator;
}) {
  const steps = [
    t('cloudHelpStep1'),
    t('cloudHelpStep2'),
    t('cloudHelpStep3'),
    t('cloudHelpStep4'),
    t('cloudHelpStep5'),
    t('cloudHelpStep6'),
    t('cloudHelpStep7'),
    t('cloudHelpStep8'),
    t('cloudHelpStep9'),
    t('cloudHelpStep10'),
  ];

  return (
    <Dialog open onClose={onClose} title={t('cloudHelpTitle')}>
      <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          {steps.map((step) => (
            <li
              key={step}
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.82rem',
                lineHeight: '1.6',
                marginBottom: '12px',
              }}
            >
              {step}
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-end" style={{ marginTop: '20px' }}>
        <button
          className="play-all-btn cursor-pointer"
          onClick={onClose}
          style={{
            padding: '8px 24px',
            borderRadius: '16px',
            background: 'var(--white)',
            color: 'var(--bg-deep)',
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          OK
        </button>
      </div>
    </Dialog>
  );
}

function toForm(config: CloudStoragePublicConfig | null): CloudFormState {
  if (!config) {
    return EMPTY_FORM;
  }
  return {
    accountId: config.accountId,
    bucket: config.bucket,
    prefix: config.prefix || 'ton',
    accessKeyId: config.accessKeyId,
    secretAccessKey: '',
    jurisdiction: config.jurisdiction,
  };
}

function formatProgress(progress: CloudSyncProgress | null, result: CloudSyncResult | null, t: Translator): string | null {
  if (progress) {
    return t('cloudProgress', {
      phase: t(`cloudPhase_${progress.phase}`),
      current: progress.current,
      total: progress.total,
      uploaded: progress.uploaded,
      downloaded: progress.downloaded,
      skipped: progress.skipped,
      failed: progress.failed,
    });
  }
  if (result) {
    return t('cloudResult', {
      uploaded: result.uploaded,
      downloaded: result.downloaded,
      skipped: result.skipped,
      playlists: result.importedPlaylists,
    });
  }
  return null;
}

function formatCloudError(error: unknown, t: Translator): string {
  if (!(error instanceof Error)) {
    return t('cloudFailed');
  }
  const errorKey = normalizeCloudStorageErrorKey(error.message);
  if (errorKey) {
    return t(errorKey);
  }
  return error.message || t('cloudFailed');
}

export function CloudSection({ layout, t }: CloudSectionProps) {
  const [form, setForm] = useState<CloudFormState>(EMPTY_FORM);
  const [hasSecret, setHasSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<CloudSyncProgress | null>(null);
  const [result, setResult] = useState<CloudSyncResult | null>(null);

  useEffect(() => {
    void window.api.invoke('cloud:get-config').then((config) => {
      setForm(toForm(config));
      setHasSecret(Boolean(config?.hasSecretAccessKey));
    });
  }, []);

  useEffect(() => {
    const handler = (payload: unknown) => {
      setProgress(payload as CloudSyncProgress);
    };
    window.api.on('cloud:progress', handler);
    return () => window.api.off('cloud:progress', handler);
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
      setForm(toForm(saved));
      await window.api.invoke('cloud:test-config');
      setStatus(t('cloudConnected'));
      setProgress(null);
    } catch (error) {
      setStatus(formatCloudError(error, t));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }, [buildConfig, t]);

  const runTask = useCallback(async (
    task: 'cloud:upload-missing' | 'cloud:fetch-library' | 'cloud:sync-now',
  ) => {
    setBusy(true);
    setStatus(null);
    setResult(null);
    setProgress(null);
    try {
      const taskResult = await window.api.invoke(task);
      setResult(taskResult as CloudSyncResult | null);
      setStatus(taskResult ? t('cloudDone') : t('cloudCancelled'));
    } catch (error) {
      setStatus(formatCloudError(error, t));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [t]);

  const progressText = formatProgress(progress, result, t);

  return (
    <div>
      <SectionHeader
        compact={layout.compact}
        icon={<span style={{ fontSize: '0.9rem' }}>R2</span>}
        title={
          <span className="flex items-center gap-2">
            {t('cloudSection')}
            <HelpButton title={t('cloudHelpTitle')} onClick={() => setShowHelp(true)} />
          </span>
        }
        description={t('cloudDescription')}
      />
      {showHelp && <CloudHelpDialog t={t} onClose={() => setShowHelp(false)} />}
      <div className="flex flex-col gap-3" style={{ paddingLeft: layout.sectionIndent }}>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: layout.compact ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}
        >
          <Field label={t('cloudAccountId')} value={form.accountId} onChange={(value) => setForm((state) => ({ ...state, accountId: value }))} />
          <Field label={t('cloudBucket')} value={form.bucket} onChange={(value) => setForm((state) => ({ ...state, bucket: value }))} />
          <Field label={t('cloudPrefix')} value={form.prefix} onChange={(value) => setForm((state) => ({ ...state, prefix: value }))} placeholder="ton" />
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
          <Field label={t('cloudAccessKeyId')} value={form.accessKeyId} onChange={(value) => setForm((state) => ({ ...state, accessKeyId: value }))} />
          <Field
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
          <ActionButton primary disabled={busy || !canRun} onClick={() => void saveAndTest()}>
            {busy ? t('cloudWorking') : t('cloudSaveTest')}
          </ActionButton>
          <ActionButton disabled={busy || !canRun} onClick={() => void runTask('cloud:upload-missing')}>
            {t('cloudUploadMissing')}
          </ActionButton>
          <ActionButton disabled={busy || !canRun} onClick={() => void runTask('cloud:fetch-library')}>
            {t('cloudFetchLibrary')}
          </ActionButton>
          <ActionButton disabled={busy || !canRun} onClick={() => void runTask('cloud:sync-now')}>
            {t('cloudSyncNow')}
          </ActionButton>
          <ActionButton disabled={!busy} onClick={() => void window.api.invoke('cloud:cancel')}>
            {t('cloudCancel')}
          </ActionButton>
        </div>
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
      </div>
    </div>
  );
}
