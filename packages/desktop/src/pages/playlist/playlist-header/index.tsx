import {
  formatDuration,
  formatTrackFileSizeSummary,
  summarizeTrackFileSizes,
} from '@ton/core';
import { PlaylistActions } from './playlist-actions';
import { SelectionRail } from './playlist-actions/selection-rail';
import { PlaylistCover } from './playlist-cover';
import { PlaylistSearchInput } from './playlist-search-input';
import type { PlaylistHeaderProps } from './types';
import type { PlaylistLayout } from '../playlist-page/use-playlist-layout';

export function PlaylistHeader({
  filterQuery,
  isSmart,
  onDelete,
  onEdit,
  onExport,
  onFilterChange,
  onImport,
  onPlayAll,
  onRemoveSelected,
  playlist,
  selectedCount,
  t,
  tracks,
  layout,
}: PlaylistHeaderProps & { layout: PlaylistLayout }) {
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration_ms || 0), 0);
  const totalSizeLabel = formatTrackFileSizeSummary(summarizeTrackFileSizes(tracks));

  return (
    <div
      className="shrink-0 flex gap-6"
      style={{
        padding: `var(--desktop-page-top) ${layout.contentPaddingX}px 24px`,
        alignItems: 'flex-start',
        flexDirection: 'column',
      }}
    >
      <div
        className="flex min-w-0"
        style={{
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: layout.compact ? '16px' : '24px',
          width: '100%',
        }}
      >
        <PlaylistCover playlist={playlist} size={layout.coverSize} />

        <div
          className="min-w-0 flex-1 flex flex-col"
          style={{ minHeight: layout.compact ? 0 : '180px' }}
        >
        <h1
          className="text-[1.8rem] font-bold tracking-tight block"
          style={{
            fontFamily: "'Syne', sans-serif",
            color: 'var(--white)',
            lineHeight: 1.16,
            paddingBottom: '0.16em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {playlist.name}
        </h1>

        <div
          className="flex items-center gap-2 mt-1 flex-wrap"
          style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}
        >
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {t('trackCount', { count: tracks.length })}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>·</span>
          <span>{formatDuration(totalDuration)}</span>
          <span style={{ color: 'var(--text-secondary)' }}>·</span>
          <span>{totalSizeLabel}</span>
        </div>

        {!layout.compact && <div className="flex-1" />}

        {selectedCount > 0 && (
          <div
            style={{
              marginTop: layout.compact ? '14px' : 'auto',
              width: '100%',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <SelectionRail
              compact
              t={t}
              onRemoveSelected={onRemoveSelected}
            />
          </div>
        )}
        </div>

        <div
          className="min-w-0 flex flex-col"
          style={{
            gap: '10px',
            marginLeft: 'auto',
            width: layout.compact ? '100%' : 'min(480px, 44%)',
            alignItems: 'stretch',
          }}
        >
          {tracks.length > 0 && (
            <PlaylistSearchInput
              compact
              filterQuery={filterQuery}
              placeholder={t('searchPlaceholder')}
              onFilterChange={onFilterChange}
            />
          )}

          <PlaylistActions
            align="end"
            compact
            isSmart={isSmart}
            t={t}
            tracksCount={tracks.length}
            onDelete={onDelete}
            onEdit={onEdit}
            onExport={onExport}
            onImport={onImport}
            onPlayAll={onPlayAll}
          />
        </div>
      </div>
    </div>
  );
}
