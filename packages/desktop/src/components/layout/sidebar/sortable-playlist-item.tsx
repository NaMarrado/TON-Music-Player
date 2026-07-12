import { memo } from 'react';
import { NavLink } from 'react-router';
import type { Playlist } from '@ton/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlaylistArtwork } from '../../ui/playlist-artwork';
import { HoverMarqueeText } from '../../ui/hover-marquee-text';

export const SortablePlaylistItem = memo(function SortablePlaylistItem({
  collapsed,
  playlist,
}: {
  collapsed: boolean;
  playlist: Playlist;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(playlist.id),
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition || undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <NavLink
        to={`/playlist/${playlist.id}`}
        title={playlist.name}
        className="sidebar-playlist-item flex items-center no-underline"
        style={{
          padding: collapsed ? '8px 0' : '8px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem',
          textDecoration: 'none',
          gap: collapsed ? 0 : '12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <div
          className="shrink-0 rounded overflow-hidden flex items-center justify-center"
          style={{
            width: '36px',
            height: '36px',
            background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)',
          }}
        >
          <PlaylistArtwork
            coverPath={playlist.cover_path}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            fallback={playlist.is_smart ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
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
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <HoverMarqueeText text={playlist.name} style={{ color: 'inherit' }} />
          </div>
        )}
      </NavLink>
    </div>
  );
});
