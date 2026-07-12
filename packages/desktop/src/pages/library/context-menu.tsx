import { useRef } from 'react';
import type { Playlist } from '@ton/core';

interface TrackContextMenuProps {
  x: number;
  y: number;
  playlists: Playlist[];
  onAddToPlaylist: (playlistId: number) => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function TrackContextMenu({
  x,
  y,
  playlists,
  onAddToPlaylist,
  onDelete,
  t,
}: TrackContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const adjustedY = Math.min(y, window.innerHeight - 280);
  const adjustedX = Math.min(x, window.innerWidth - 200);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg overflow-hidden"
      style={{
        top: adjustedY,
        left: adjustedX,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        minWidth: '180px',
        padding: '4px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Add to Playlist */}
      <div
        style={{
          padding: '6px 12px 4px',
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-secondary)',
        }}
      >
        {t('addToPlaylist')}
      </div>
      {playlists.length === 0 ? (
        <div
          style={{
            padding: '6px 12px 8px',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
          }}
        >
          {t('noPlaylists')}
        </div>
      ) : (
        playlists.map((pl) => (
          <button
            key={pl.id}
            className="w-full text-left cursor-pointer"
            onClick={() => onAddToPlaylist(pl.id)}
            style={{
              display: 'block',
              padding: '8px 12px',
              borderRadius: '6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              fontFamily: 'inherit',
              transition: 'background var(--transition)',
            }}
          >
            {pl.name}
          </button>
        ))
      )}

      {/* Separator */}
      <div
        style={{
          height: '1px',
          background: 'var(--border-subtle)',
          margin: '4px 0',
        }}
      />

      {/* Delete */}
      <button
        className="w-full text-left cursor-pointer"
        onClick={onDelete}
        style={{
          display: 'block',
          padding: '8px 12px',
          borderRadius: '6px',
          background: 'transparent',
          border: 'none',
          color: '#f87171',
          fontSize: '0.82rem',
          fontFamily: 'inherit',
          transition: 'background var(--transition)',
        }}
      >
        {t('delete')}
      </button>
    </div>
  );
}
