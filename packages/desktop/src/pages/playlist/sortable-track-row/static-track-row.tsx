import { memo } from 'react';
import { formatDownloadedDate, formatTime } from '@ton/core';
import type { PlaylistTrackEntry } from '@ton/core';
import { CoverArt } from './cover-art';
import { PlaylistTrackGridShell, getPlaylistTrackGridStyle } from './grid-shell';
import { RowCheckbox } from './row-checkbox';
import { HoverMarqueeText } from '../../../components/ui/hover-marquee-text';

export const StaticTrackRow = memo(function StaticTrackRow({
  dense = false,
  index,
  isPlaying,
  isSelected,
  locale,
  onClick,
  showArtist,
  showDownloaded,
  onToggleSelect,
  showDragSpacer,
  track,
}: {
  track: PlaylistTrackEntry;
  dense?: boolean;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  locale: string;
  showDragSpacer?: boolean;
  showArtist: boolean;
  showDownloaded: boolean;
  onClick: () => void;
  onToggleSelect: (shiftKey: boolean) => void;
}) {
  return (
    <div
      className="track-row cursor-pointer"
      onClick={onClick}
      style={{
        paddingBlock: 'var(--track-row-block-padding)',
        ...getPlaylistTrackGridStyle({
          dense,
          showArtist,
          showDownloaded,
          showDrag: Boolean(showDragSpacer),
        }),
        borderRadius: '6px',
        transition: 'background var(--transition)',
        background: isSelected ? 'var(--glow-strong)' : isPlaying ? 'var(--glow-strong)' : undefined,
        userSelect: 'none',
      }}
    >
      <PlaylistTrackGridShell
        showArtist={showArtist}
        showDownloaded={showDownloaded}
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
}, (prev, next) =>
  prev.track === next.track &&
  prev.dense === next.dense &&
  prev.index === next.index &&
  prev.isPlaying === next.isPlaying &&
  prev.isSelected === next.isSelected &&
  prev.locale === next.locale &&
  prev.showArtist === next.showArtist &&
  prev.showDownloaded === next.showDownloaded &&
  prev.showDragSpacer === next.showDragSpacer,
);
