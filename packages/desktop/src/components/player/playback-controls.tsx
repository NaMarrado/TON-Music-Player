import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../stores/playback-store';
import { toggle, nextTrack, prevTrack, toggleShuffle, toggleRepeat } from '../../audio/playback-service';

export const PlaybackControls = memo(function PlaybackControls({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { t } = useTranslation('components/player/playback-controls');
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const shuffle = usePlaybackStore((s) => s.shuffle);
  const repeat = usePlaybackStore((s) => s.repeat);

  return (
    <div className="flex items-center" style={{ gap: compact ? '10px' : '20px' }}>
      <ControlBtn
        compact={compact}
        title={t('shuffle')}
        active={shuffle}
        onClick={toggleShuffle}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="4" x2="9" y2="9" />
          </svg>
        }
      />

      <ControlBtn
        compact={compact}
        title={t('previous')}
        onClick={() => prevTrack()}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="5" width="3" height="14" rx="1" />
            <polygon points="21 5 10 12 21 19" />
          </svg>
        }
      />

      <button
        className="play-btn flex items-center justify-center rounded-full cursor-pointer"
        title={isPlaying ? t('pause') : t('play')}
        onClick={() => toggle()}
        style={{
          width: compact ? '36px' : '40px',
          height: compact ? '36px' : '40px',
          background: 'var(--white)',
          border: 'none',
          boxShadow: '0 2px 12px rgba(255,255,255,0.08)',
          transition: 'var(--transition)',
        }}
      >
        {isPlaying ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--bg-deep)">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--bg-deep)">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      <ControlBtn
        compact={compact}
        title={t('next')}
        onClick={() => nextTrack()}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="18" y="5" width="3" height="14" rx="1" />
            <polygon points="3 5 14 12 3 19" />
          </svg>
        }
      />

      <ControlBtn
        compact={compact}
        title={repeat === 'one' ? t('repeatOne') : t('repeat')}
        active={repeat === 'one'}
        onClick={toggleRepeat}
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        }
      />
    </div>
  );
});

function ControlBtn({
  compact = false,
  title,
  icon,
  active,
  onClick,
}: {
  compact?: boolean;
  title: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="ctrl-btn flex items-center justify-center rounded-full cursor-pointer relative"
      title={title}
      onClick={onClick}
      style={{
        width: compact ? '28px' : '32px',
        height: compact ? '28px' : '32px',
        color: active ? 'var(--white)' : 'var(--text-secondary)',
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: 'none',
        transition: 'var(--transition)',
      }}
    >
      {icon}
      {active && (
        <span
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: '-4px',
            width: '4px',
            height: '4px',
            background: 'var(--white)',
            borderRadius: '50%',
          }}
        />
      )}
    </button>
  );
}
