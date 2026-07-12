import { memo } from 'react';
import { CUSTOM_PROTOCOL } from '@ton/core';
import type { Track } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { NoCoverArt } from '../../components/ui/no-cover-art';

export const HomeTrackCard = memo(function HomeTrackCard({
  onPlay,
  track,
}: {
  track: Track;
  onPlay: () => void;
}) {
  const currentTrackId = usePlaybackStore((state) => state.currentTrack?.id);
  const isPlaying = currentTrackId === track.id;
  const coverUrl = track.cover_art_path
    ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(track.cover_art_path)}`
    : null;

  return (
    <div
      className="cursor-pointer album-card"
      style={{
        minWidth: '140px',
        maxWidth: '140px',
        borderRadius: 'var(--radius-lg)',
        padding: '4px',
        transition: 'all var(--transition)',
      }}
      onClick={onPlay}
    >
      <div
        className="relative w-full rounded-[var(--radius)] overflow-hidden mb-2"
        style={{ aspectRatio: '1' }}
      >
        {coverUrl ? (
          <img src={coverUrl} alt={track.title || ''} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <NoCoverArt iconSize={24} />
        )}
        <div
          className="track-card-overlay absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        >
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: '40px',
              height: '40px',
              background: 'var(--white)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--bg-deep)">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </div>
      </div>
      <div
        className="truncate"
        style={{
          fontSize: '0.82rem',
          fontWeight: 500,
          color: isPlaying ? 'var(--white)' : 'var(--text-primary)',
        }}
      >
        {track.title || 'Unknown'}
      </div>
    </div>
  );
});
