import { formatDownloadedDate, formatTime } from '@ton/core';
import type { PlaylistTrackEntry } from '@ton/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CoverArt } from './cover-art';
import { PlaylistTrackGridShell } from './grid-shell';
import { getPlaylistTrackGridStyle } from './layout';
import { RowCheckbox } from './row-checkbox';
import { HoverMarqueeText } from '../../../components/ui/hover-marquee-text';
import { StarButton } from '../../library/track-list-view/star-button';

export function SortableTrackRow({
  index,
  isPlaying,
  isSelected,
  locale,
  onClick,
  onToggleSelect,
  sortId,
  track,
}: {
  track: PlaylistTrackEntry;
  index: number;
  sortId: string;
  isPlaying: boolean;
  isSelected: boolean;
  locale: string;
  onClick: () => void;
  onToggleSelect: (shiftKey: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortId });

  return (
    <div
      ref={setNodeRef}
      className="playlist-track-grid track-row group cursor-pointer"
      style={{
        paddingBlock: 'var(--track-row-block-padding)',
        ...getPlaylistTrackGridStyle(true),
        borderRadius: '6px',
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition || undefined,
        opacity: isDragging ? 0.5 : 1,
        background: isSelected ? 'var(--glow-strong)' : isPlaying ? 'var(--glow-strong)' : undefined,
        userSelect: 'none',
        zIndex: isDragging ? 10 : undefined,
        willChange: isDragging ? 'transform' : undefined,
      }}
      onClick={onClick}
    >
      <PlaylistTrackGridShell
        showDrag
        dragSlot={
          <button
            className="flex items-center justify-center cursor-grab"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              padding: 0,
              touchAction: 'none',
            }}
            {...attributes}
            {...listeners}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </button>
        }
        indexSlot={
          <span
            className="text-center"
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
            }}
          >
            {index + 1}
          </span>
        }
        coverSlot={<CoverArt track={track} isPlaying={isPlaying} />}
        titleSlot={
          <>
            <HoverMarqueeText
              text={track.title || 'Untitled'}
              style={{
                fontSize: '0.88rem',
                color: isPlaying ? 'var(--white)' : 'var(--text-primary)',
                fontWeight: isPlaying ? 500 : 400,
              }}
            />
            <HoverMarqueeText
              className="track-inline-artist"
              text={track.artist || 'Unknown'}
              style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '1px' }}
            />
          </>
        }
        artistSlot={
          <HoverMarqueeText
            text={track.artist || 'Unknown'}
            style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}
          />
        }
        downloadedSlot={
          <HoverMarqueeText
            text={formatDownloadedDate(track.downloaded_at, locale)}
            style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}
          />
        }
        timeSlot={
          <HoverMarqueeText
            text={formatTime(track.duration_ms)}
            style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}
          />
        }
        checkboxSlot={<RowCheckbox isSelected={isSelected} onToggle={onToggleSelect} />}
        starSlot={<StarButton trackId={track.id} rating={track.rating} />}
      />
    </div>
  );
}
