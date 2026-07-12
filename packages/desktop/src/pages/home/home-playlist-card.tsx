import { memo } from 'react';
import type { Playlist } from '@ton/core';
import { PlaylistArtwork } from '../../components/ui/playlist-artwork';

export const HomePlaylistCard = memo(function HomePlaylistCard({
  onClick,
  playlist,
}: {
  playlist: Playlist;
  onClick: () => void;
}) {
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
      onClick={onClick}
    >
      <div
        className="relative w-full rounded-[var(--radius)] overflow-hidden mb-2"
        style={{ aspectRatio: '1' }}
      >
        <PlaylistArtwork
          coverPath={playlist.cover_path}
          alt={playlist.name}
          className="w-full h-full object-cover"
          loading="lazy"
          fallback={(
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1a1a1a, #2d2d2d)' }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </div>
          )}
        />
      </div>
      <div className="truncate" style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)' }}>
        {playlist.name}
      </div>
    </div>
  );
});
