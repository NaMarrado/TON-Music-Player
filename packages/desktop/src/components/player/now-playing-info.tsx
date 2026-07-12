import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_PROTOCOL } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { NoCoverArt } from '../ui/no-cover-art';
import { HoverMarqueeText } from '../ui/hover-marquee-text';

export const NowPlayingInfo = memo(function NowPlayingInfo({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { t } = useTranslation('components/layout/now-playing-bar');
  const currentTrack = usePlaybackStore((s) => s.currentTrack);

  const coverUrl = currentTrack?.cover_art_path
    ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(currentTrack.cover_art_path)}`
    : null;

  return (
    <div className="flex items-center min-w-0" style={{ gap: compact ? '10px' : '14px' }}>
      <div
        className="shrink-0 rounded-[6px] overflow-hidden"
        style={{ width: compact ? '44px' : '56px', height: compact ? '44px' : '56px' }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <NoCoverArt iconSize={compact ? 16 : 20} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <HoverMarqueeText
          className="font-medium"
          text={currentTrack?.title || t('noTrackPlaying')}
          style={{ fontSize: compact ? '0.82rem' : '0.88rem', color: 'var(--white)' }}
        />
        <HoverMarqueeText
          text={currentTrack?.artist || t('unknownArtist')}
          style={{
            fontSize: compact ? '0.72rem' : '0.78rem',
            color: 'var(--text-secondary)',
            marginTop: '2px',
          }}
        />
      </div>
    </div>
  );
});
