import { memo } from 'react';
import { formatDownloadedDate, formatTime } from '@ton/core';
import type { LibraryTrack } from '../../../stores/library-store';
import { LibraryTrackGridShell } from './grid-shell';
import { libraryTrackGridStyle } from './layout';
import { SelectionCheckbox } from './selection-checkbox';
import { TrackRowCoverArt } from './track-row-cover-art';
import { HoverMarqueeText } from '../../../components/ui/hover-marquee-text';
import { StarButton } from './star-button';

type TrackRowProps = {
  isPlaying: boolean;
  isSelected: boolean;
  locale: string;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onToggleSelect: (shiftKey: boolean) => void;
  track: LibraryTrack;
};

export const TrackRow = memo(function TrackRow({
  isPlaying,
  isSelected,
  locale,
  onClick,
  onContextMenu,
  onToggleSelect,
  track,
}: TrackRowProps) {
  return (
    <div
      className="library-track-grid track-row group cursor-pointer"
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        paddingBlock: 'var(--track-row-block-padding)',
        ...libraryTrackGridStyle,
        borderRadius: '6px',
        transition: 'background var(--transition)',
        userSelect: 'none',
        background: isSelected
          ? 'var(--glow-strong)'
          : isPlaying
            ? 'var(--glow-strong)'
            : undefined,
      }}
    >
      <LibraryTrackGridShell
        coverSlot={<TrackRowCoverArt track={track} isPlaying={isPlaying} />}
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
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                marginTop: '1px',
              }}
            />
          </>
        }
        artistSlot={
          <HoverMarqueeText
            text={track.artist || 'Unknown'}
            style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}
          />
        }
        playlistSlot={
          <HoverMarqueeText
            text={track.playlist_names || '—'}
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
        checkboxSlot={
          <SelectionCheckbox
            checked={isSelected}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(event.shiftKey);
            }}
          />
        }
        starSlot={<StarButton trackId={track.id} rating={track.rating} />}
      />
    </div>
  );
}, (prev, next) =>
  prev.track === next.track &&
  prev.isPlaying === next.isPlaying &&
  prev.isSelected === next.isSelected &&
  prev.locale === next.locale,
);
