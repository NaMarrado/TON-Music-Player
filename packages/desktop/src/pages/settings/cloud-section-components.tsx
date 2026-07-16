import { useState } from 'react';
import type { CloudAutoSyncStatus, CloudR2CleanupPreview } from '@ton/core';
import { Dialog } from '../../components/ui/dialog';
import type { Translator } from './cloud-section-types';
import { cloudAutoSyncStateKey } from './cloud-section-utils';

export function CloudField({
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
  const [revealed, setRevealed] = useState(false);
  const masked = type === 'password';
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)',
        marginBottom: '4px', letterSpacing: '0.04em',
      }}>
        {label}
      </span>
      <span style={{ display: 'flex', position: 'relative' }}>
        <input
          type={masked && !revealed ? 'password' : 'text'}
          className="w-full outline-none"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            background: 'var(--bg-deep)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: masked ? '9px 40px 9px 12px' : '9px 12px',
            color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.82rem',
          }}
        />
        {masked && (
          <button
            type="button"
            aria-label={revealed ? 'Hide value' : 'Show value'}
            onClick={() => setRevealed((current) => !current)}
            style={{
              background: 'transparent', border: 0, color: 'var(--text-secondary)',
              cursor: 'pointer', height: '100%', padding: '0 12px', position: 'absolute', right: 0,
            }}
          >
            {revealed ? '×' : '○'}
          </button>
        )}
      </span>
    </label>
  );
}

export function CloudActionButton({
  children,
  disabled,
  onClick,
  primary = false,
  danger = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`${primary ? 'play-all-btn' : 'preset-btn'} cursor-pointer`}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: '16px',
        background: primary ? 'var(--white)' : danger ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
        color: primary ? 'var(--bg-deep)' : danger ? '#f87171' : 'var(--text-secondary)',
        border: primary ? 'none' : danger ? '1px solid rgba(239, 68, 68, 0.65)' : '1px solid var(--border)',
        fontSize: '0.78rem', fontWeight: 500, fontFamily: 'inherit',
        opacity: disabled ? 0.5 : 1, width: '100%',
      }}
    >
      {children}
    </button>
  );
}

export function CloudCleanupDialog({
  busy,
  formatSize,
  onAbort,
  onCancel,
  onConfirm,
  preview,
  t,
}: {
  busy: boolean;
  formatSize: (bytes: number) => string;
  onAbort: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  preview: CloudR2CleanupPreview;
  t: Translator;
}) {
  return (
    <Dialog open onClose={busy ? () => {} : onCancel} title={t('cloudCleanupTitle')}>
      <div className="flex flex-col gap-2" style={{ marginBottom: '22px' }}>
        <p style={{ color: 'var(--text-primary)', fontSize: '0.86rem' }}>
          {t('cloudCleanupSongs', { count: preview.cloudOnlyTracks })}
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          {t('cloudCleanupPlaylists', { count: preview.affectedPlaylists })}
        </p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          {t('cloudCleanupSpace', { size: formatSize(preview.reclaimableBytes) })}
        </p>
        <p style={{ color: '#f87171', fontSize: '0.8rem', lineHeight: 1.55, marginTop: '8px' }}>
          {t('cloudCleanupWarning')}
        </p>
      </div>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={busy ? onAbort : onCancel}
          style={{
            padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          {t('cloudCancel')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          style={{
            padding: '9px 16px', borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.65)',
            background: 'rgba(239, 68, 68, 0.14)', color: '#f87171',
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.55 : 1,
          }}
        >
          {busy ? t('cloudWorking') : t('cloudCleanupConfirm', { count: preview.cloudOnlyTracks })}
        </button>
      </div>
    </Dialog>
  );
}

export function CloudHelpButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      className="download-btn cursor-pointer flex items-center justify-center"
      onClick={onClick}
      title={title}
      style={{
        width: '20px', height: '20px', borderRadius: '50%',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        color: 'var(--white)', fontSize: '0.7rem', fontWeight: 600,
        fontFamily: 'inherit', padding: 0, transition: 'all var(--transition)',
      }}
    >
      ?
    </button>
  );
}

export function CloudHelpDialog({ onClose, t }: { onClose: () => void; t: Translator }) {
  const steps = Array.from({ length: 10 }, (_, index) => t(`cloudHelpStep${index + 1}`));
  return (
    <Dialog open onClose={onClose} title={t('cloudHelpTitle')}>
      <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          {steps.map((step) => (
            <li key={step} style={{
              color: 'var(--text-secondary)', fontSize: '0.82rem',
              lineHeight: '1.6', marginBottom: '12px',
            }}>
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
            padding: '8px 24px', borderRadius: '16px', background: 'var(--white)',
            color: 'var(--bg-deep)', border: 'none', fontSize: '0.78rem',
            fontWeight: 500, fontFamily: 'inherit', transition: 'all var(--transition)',
          }}
        >
          OK
        </button>
      </div>
    </Dialog>
  );
}

export function CloudAutoSyncSummary({
  lastSuccessText,
  nextRetryText,
  status,
  t,
}: {
  lastSuccessText: string | null;
  nextRetryText: string | null;
  status: CloudAutoSyncStatus;
  t: Translator;
}) {
  const secondaryStyle = { color: 'var(--text-secondary)', fontSize: '0.74rem' };
  return (
    <div style={{
      border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
      padding: '10px 12px', background: 'var(--bg-deep)',
    }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.5 }}>
        {t(status.enabled ? 'cloudAutoSyncEnabledDescription' : 'cloudAutoSyncDisabledDescription')}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ marginTop: '7px' }}>
        <span style={{ color: 'var(--white)', fontSize: '0.74rem' }}>
          {t(cloudAutoSyncStateKey(status.state))}
        </span>
        {status.pendingChanges > 0 && (
          <span style={secondaryStyle}>{t('cloudAutoSyncPendingChanges', { count: status.pendingChanges })}</span>
        )}
        {status.pendingDownloads > 0 && (
          <span style={secondaryStyle}>{t('cloudAutoSyncPendingDownloads', { count: status.pendingDownloads })}</span>
        )}
        {lastSuccessText && (
          <span style={secondaryStyle}>{t('cloudAutoSyncLastSuccess', { time: lastSuccessText })}</span>
        )}
        {nextRetryText && (
          <span style={secondaryStyle}>{t('cloudAutoSyncNextRetry', { time: nextRetryText })}</span>
        )}
        {status.lastErrorKey && (status.state === 'error' || status.state === 'backing-off') && (
          <span style={secondaryStyle}>{t(status.lastErrorKey)}</span>
        )}
      </div>
    </div>
  );
}
