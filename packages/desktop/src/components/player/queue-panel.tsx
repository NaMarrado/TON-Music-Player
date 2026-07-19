import { useTranslation } from 'react-i18next';
import { useQueueStore } from '../../stores/queue-store';
import { usePlaybackStore } from '../../stores/playback-store';
import { jumpToQueueIndex } from '../../audio/playback-service';
import { CUSTOM_PROTOCOL } from '@ton/core';
import { NoCoverArt } from '../ui/no-cover-art';
import { HoverMarqueeText } from '../ui/hover-marquee-text';
import { memo } from 'react';
import type { QueueItem, Track } from '@ton/core';
import { VirtualizedList } from './virtualized-list';
import { DESKTOP_QUEUE_PANEL_WIDTH } from '../../shared/layout';

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('components/player/queue-panel');
  const items = useQueueStore((s) => s.items);
  const currentIndex = useQueueStore((s) => s.currentIndex);
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const upcomingItems = items.slice(currentIndex + 1);

  return (
    <div
      className="flex h-full shrink-0 flex-col"
      style={{
        width: `${DESKTOP_QUEUE_PANEL_WIDTH}px`,
        background: 'var(--bg-base)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between shrink-0" style={{ padding: '16px 16px 12px' }}>
        <h3 className="font-semibold" style={{ fontSize: '0.95rem', color: 'var(--white)' }}>
          {t('title')}
        </h3>
        <button
          onClick={onClose}
          className="flex items-center justify-center cursor-pointer"
          style={{ width: '28px', height: '28px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', transition: 'var(--transition)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Now playing */}
      {currentTrack && (
        <div style={{ padding: '0 16px 12px' }}>
          <p className="uppercase font-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {t('nowPlaying')}
          </p>
          <QueueTrackRow track={currentTrack} isActive />
        </div>
      )}

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)', margin: '0 16px' }} />

      {/* Up next */}
      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: '12px 16px' }}>
        <p className="uppercase font-semibold" style={{ fontSize: '0.65rem', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          {t('upNext')} ({Math.max(0, items.length - currentIndex - 1)})
        </p>
        {upcomingItems.length > 0 ? (
          <VirtualizedList
            className="scrollbar-hidden flex-1 min-h-0 overflow-y-auto"
            items={upcomingItems}
            estimateSize={52}
            overscan={8}
            keyExtractor={(item) => item.id}
            renderItem={(item, index) => {
              return (
                <QueueTrackRow
                  item={item}
                  onClick={() => jumpToQueueIndex(currentIndex + 1 + index)}
                />
              );
            }}
          />
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', marginTop: '20px' }}>
            {t('emptyQueue')}
          </p>
        )}
      </div>
    </div>
  );
}

const QueueTrackRow = memo(function QueueTrackRow({
  item,
  track,
  isActive,
  onClick,
}: {
  item?: QueueItem;
  track?: Track;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const coverPath = track?.cover_art_path ?? item?.cover_art_path ?? null;
  const coverUrl = coverPath
    ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(coverPath)}`
    : null;
  const title = track?.title ?? item?.title ?? 'Unknown';
  const artist = track?.artist ?? item?.artist ?? 'Unknown Artist';

  return (
    <div
      className="flex items-center gap-3 rounded-lg"
      style={{
        padding: '6px 8px',
        cursor: onClick ? 'pointer' : 'default',
        background: isActive ? 'var(--glow-strong)' : 'transparent',
        transition: 'background var(--transition)',
      }}
      onClick={onClick}
    >
      <div className="shrink-0 rounded overflow-hidden" style={{ width: '36px', height: '36px' }}>
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <NoCoverArt iconSize={14} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <HoverMarqueeText
          text={title}
          style={{ fontSize: '0.82rem', color: isActive ? 'var(--white)' : 'var(--text-primary)' }}
        />
        <HoverMarqueeText
          text={artist}
          style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}
        />
      </div>
    </div>
  );
});
