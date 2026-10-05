import { memo } from 'react';
import { formatDownloadedDate, formatTime } from '@ton/core';
import type { PlaylistTrackEntry } from '@ton/core';
import { CoverArt } from './cover-art';
import { PlaylistTrackGridShell } from './grid-shell';
import { getPlaylistTrackGridStyle } from './layout';
import { RowCheckbox } from './row-checkbox';
import { HoverMarqueeText } from '../../../components/ui/hover-marquee-text';
import { StarButton } from '../../library/track-list-view/star-button';

export const StaticTrackRow = memo(function StaticTrackRow({
  index,
  isPlaying,
  isSelected,
  locale,
  onClick,
  onToggleSelect,
  showDragSpacer,
  track,
  overlay = false,
}: {
  track: PlaylistTrackEntry;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  locale: string;
  showDragSpacer?: boolean;
  onClick: () => void;
  onToggleSelect: (shiftKey: boolean) => void;
  overlay?: boolean;
}) {
  return (
    <div
      className="playlist-track-grid track-row cursor-pointer"
      onClick={onClick}
      style={{
        paddingBlock: 'var(--track-row-block-padding)',
        ...getPlaylistTrackGridStyle(Boolean(showDragSpacer)),
        borderRadius: '6px',
        transition: 'background var(--transition)',
        background: isSelected ? 'var(--glow-strong)' : isPlaying ? 'var(--glow-strong)' : undefined,
        userSelect: 'none',
      }}
    >
      <PlaylistTrackGridShell
        showDrag={Boolean(showDragSpacer)}
        dragSlot={null}
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
        starSlot={<StarButton trackId={track.id} rating={track.rating} disabled={overlay} />}
      />
    </div>
  );
}, (prev, next) =>
  prev.track === next.track &&
  prev.index === next.index &&
  prev.isPlaying === next.isPlaying &&
  prev.isSelected === next.isSelected &&
  prev.locale === next.locale &&
  prev.showDragSpacer === next.showDragSpacer &&
  prev.overlay === next.overlay,
);
