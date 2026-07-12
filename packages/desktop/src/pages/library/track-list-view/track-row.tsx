import { memo } from 'react';
import { formatTime } from '@ton/core';
import type { LibraryTrack } from '../../../stores/library-store';
import { LibraryTrackGridShell, getLibraryTrackGridStyle } from './grid-shell';
import { SelectionCheckbox } from './selection-checkbox';
import { TrackRowCoverArt } from './track-row-cover-art';
import { HoverMarqueeText } from '../../../components/ui/hover-marquee-text';

type TrackRowProps = {
  dense: boolean;
  isPlaying: boolean;
  isSelected: boolean;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  showArtist: boolean;
  showPlaylist: boolean;
  onToggleSelect: (shiftKey: boolean) => void;
  track: LibraryTrack;
};

export const TrackRow = memo(function TrackRow({
  dense,
  isPlaying,
  isSelected,
  onClick,
  onContextMenu,
  showArtist,
  showPlaylist,
  onToggleSelect,
  track,
}: TrackRowProps) {
  return (
    <div
      className="track-row group cursor-pointer"
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        paddingBlock: 'var(--track-row-block-padding)',
        ...getLibraryTrackGridStyle({ dense, showArtist, showPlaylist }),
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
        showArtist={showArtist}
        showPlaylist={showPlaylist}
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
              className="lg:hidden"
              text={track.artist || 'Unknown'}
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
                marginTop: '1px',
              }}
            />
          </>
        }
        artistSlot={showArtist ? (
          <HoverMarqueeText
            text={track.artist || 'Unknown'}
            style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}
          />
        ) : undefined}
        playlistSlot={showPlaylist ? (
          <HoverMarqueeText
            text={track.playlist_names || '—'}
            style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}
          />
        ) : undefined}
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
      />
    </div>
  );
}, (prev, next) =>
  prev.dense === next.dense &&
  prev.track === next.track &&
  prev.isPlaying === next.isPlaying &&
  prev.isSelected === next.isSelected &&
  prev.showArtist === next.showArtist &&
  prev.showPlaylist === next.showPlaylist,
);
