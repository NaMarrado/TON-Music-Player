import { formatDownloadedDate, formatTime } from '@ton/core';
import type { PlaylistTrackEntry } from '@ton/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CoverArt } from './cover-art';
import { PlaylistTrackGridShell, getPlaylistTrackGridStyle } from './grid-shell';
import { RowCheckbox } from './row-checkbox';
import { HoverMarqueeText } from '../../../components/ui/hover-marquee-text';

export function SortableTrackRow({
  dense = false,
  index,
  isPlaying,
  isSelected,
  locale,
  onClick,
  showArtist,
  showDownloaded,
  onToggleSelect,
  sortId,
  track,
}: {
  track: PlaylistTrackEntry;
  dense?: boolean;
  index: number;
  sortId: string;
  isPlaying: boolean;
  isSelected: boolean;
  locale: string;
  showArtist: boolean;
  showDownloaded: boolean;
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
      className="track-row group cursor-pointer"
      style={{
        paddingBlock: 'var(--track-row-block-padding)',
        ...getPlaylistTrackGridStyle({
          dense,
          showArtist,
          showDownloaded,
          showDrag: true,
        }),
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
        showArtist={showArtist}
        showDownloaded={showDownloaded}
        showDrag
        dragSlot={
          <button
            className="flex items-center justify-center cursor-grab"
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
              className="lg:hidden"
              text={track.artist || 'Unknown'}
              style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '1px' }}
            />
          </>
        }
        artistSlot={showArtist ? (
          <HoverMarqueeText
            text={track.artist || 'Unknown'}
            style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}
          />
        ) : undefined}
        downloadedSlot={showDownloaded ? (
          <HoverMarqueeText
            text={formatDownloadedDate(track.downloaded_at, locale)}
            style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}
          />
        ) : undefined}
        timeSlot={
          <HoverMarqueeText
            text={formatTime(track.duration_ms)}
            style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}
          />
        }
        checkboxSlot={<RowCheckbox isSelected={isSelected} onToggle={onToggleSelect} />}
      />
    </div>
  );
}
