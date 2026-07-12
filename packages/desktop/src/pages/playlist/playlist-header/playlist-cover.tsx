import type { Playlist } from '@ton/core';
import { PlaylistArtwork } from '../../../components/ui/playlist-artwork';

export function PlaylistCover({
  playlist,
  size,
}: {
  playlist: Playlist;
  size: number;
}) {
  return (
    <div
      className="shrink-0 rounded-[var(--radius-lg)] overflow-hidden flex items-center justify-center"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: 'linear-gradient(135deg, #111, #1e1e1e)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <PlaylistArtwork
        coverPath={playlist.cover_path}
        alt=""
        className="w-full h-full object-cover"
        fallback={(
          <svg
            width="44"
            height="44"
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
        )}
      />
    </div>
  );
}
