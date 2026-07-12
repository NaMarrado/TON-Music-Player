import { CUSTOM_PROTOCOL } from '@ton/core';
import type { PlaylistTrackEntry } from '@ton/core';

export function CoverArt({
  isPlaying,
  track,
}: {
  isPlaying: boolean;
  track: PlaylistTrackEntry;
}) {
  const coverUrl = track.cover_art_path
    ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(track.cover_art_path)}`
    : null;

  return (
    <div
      className="shrink-0 rounded overflow-hidden relative"
      style={{ width: '36px', height: '36px' }}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)' }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      )}
      {isPlaying && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="now-playing-indicator flex items-end justify-center gap-[2px]"
            style={{ height: '14px' }}
          >
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
