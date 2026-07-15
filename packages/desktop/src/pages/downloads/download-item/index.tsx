import { memo } from 'react';
import type { DownloadItem } from '@ton/core';
import { DownloadItemActions } from './actions';
import { DownloadArtwork } from './download-artwork';
import { DownloadProgressBar } from './progress-bar';
import { DownloadSourceBadge } from './source-badge';
import { DownloadStatusLabel } from './status-label';
import { HoverMarqueeText } from '../../../components/ui/hover-marquee-text';

interface DownloadItemProps {
  item: DownloadItem;
  t: (key: string) => string;
}

export const DownloadItemRow = memo(function DownloadItemRow({ item, t }: DownloadItemProps) {
  const isActive = ['downloading', 'resolving', 'converting'].includes(item.status);
  const isFailed = item.status === 'error';
  const isDone = item.status === 'done';

  return (
    <div
      className="track-row"
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        transition: 'background var(--transition)',
      }}
    >
      <div className="flex items-center gap-3">
        <DownloadArtwork item={item} showOverlay={isDone || isFailed || isActive} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <HoverMarqueeText
              className="flex-1"
              text={item.title || 'Unknown'}
              style={{
                fontSize: '0.88rem',
                color: isFailed ? 'var(--text-secondary)' : 'var(--text-primary)',
                fontWeight: 400,
              }}
            />
            <DownloadSourceBadge source={item.source} />
          </div>
          <HoverMarqueeText
            text={item.artist || 'Unknown'}
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              marginTop: '2px',
            }}
          />
          {isFailed && item.error_message && (
            <div
              style={{
                color: '#ef4444',
                fontSize: '0.7rem',
                lineHeight: 1.35,
                marginTop: '3px',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
              }}
            >
              {item.error_message}
            </div>
          )}
          {isActive && <DownloadProgressBar item={item} />}
        </div>

        <DownloadStatusLabel item={item} t={t} />
        <DownloadItemActions item={item} t={t} />
      </div>
    </div>
  );
});
