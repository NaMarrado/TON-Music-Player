import type { DownloadItem } from '@ton/core';
import { STATUS_KEYS } from './constants';
import { useDownloadProgressView } from './use-download-progress-view';

export function DownloadStatusLabel({
  item,
  t,
}: {
  item: DownloadItem;
  t: (key: string) => string;
}) {
  const isFailed = item.status === 'error';
  const isDone = item.status === 'done';
  const isActive = ['resolving', 'downloading', 'converting'].includes(item.status);
  const { isIndeterminate, progressPercent } = useDownloadProgressView(item);

  return (
    <div
      className="shrink-0"
      style={{
        textAlign: 'right',
        whiteSpace: 'nowrap',
        minWidth: '72px',
      }}
    >
      <div
        style={{
          fontSize: '0.72rem',
          color: isFailed ? '#ff4444' : isDone ? '#4ade80' : 'var(--text-secondary)',
        }}
      >
        {t(STATUS_KEYS[item.status])}
      </div>
      {isActive && !isIndeterminate && (
        <div
          style={{
            marginTop: '2px',
            fontSize: '0.72rem',
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {progressPercent}%
        </div>
      )}
    </div>
  );
}
