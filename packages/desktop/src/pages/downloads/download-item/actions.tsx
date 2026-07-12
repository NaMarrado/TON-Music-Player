import type { DownloadItem } from '@ton/core';
import { cancelDownload, retryDownload } from '../../../stores/download-store';

export function DownloadItemActions({
  item,
  t,
}: {
  item: DownloadItem;
  t: (key: string) => string;
}) {
  const isActive = ['downloading', 'resolving', 'converting'].includes(item.status);
  const isFailed = item.status === 'error';
  const canCancel = item.status === 'pending' || isActive;

  return (
    <div className="shrink-0" style={{ minWidth: '56px', textAlign: 'right' }}>
      {canCancel && (
        <button
          className="download-btn cursor-pointer"
          onClick={() => cancelDownload(item.id)}
          style={{
            padding: '3px 10px',
            borderRadius: '12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            fontSize: '0.72rem',
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          {t('cancel')}
        </button>
      )}
      {isFailed && (
        <button
          className="download-btn cursor-pointer"
          onClick={() => retryDownload(item.id)}
          style={{
            padding: '3px 10px',
            borderRadius: '12px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: '0.72rem',
            fontFamily: 'inherit',
            transition: 'all var(--transition)',
          }}
        >
          {t('retry')}
        </button>
      )}
    </div>
  );
}
