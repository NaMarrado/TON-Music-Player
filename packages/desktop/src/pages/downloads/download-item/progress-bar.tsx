import type { DownloadItem } from '@ton/core';
import { useDownloadProgressView } from './use-download-progress-view';

export function DownloadProgressBar({ item }: { item: DownloadItem }) {
  const { isIndeterminate, progressPercent } = useDownloadProgressView(item);

  return (
    <div style={{ marginTop: '8px' }}>
      <div
        style={{
          height: '4px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
        >
        {isIndeterminate ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <div
              className="download-progress-indeterminate"
              style={{
                position: 'absolute',
                inset: 0,
                width: '42%',
                borderRadius: '999px',
                background:
                  item.status === 'converting'
                    ? 'linear-gradient(90deg, #60a5fa, #86efac)'
                    : 'linear-gradient(90deg, #f97316, #fb7185)',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: `${progressPercent}%`,
              minWidth: progressPercent > 0 ? '6px' : 0,
              height: '100%',
              borderRadius: '999px',
              background:
                item.status === 'converting'
                  ? 'linear-gradient(90deg, #60a5fa, #86efac)'
                  : 'linear-gradient(90deg, #f97316, #fb7185)',
              transition: 'width 160ms ease-out',
            }}
          />
        )}
      </div>
    </div>
  );
}
