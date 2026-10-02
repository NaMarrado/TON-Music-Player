import { HeaderActions } from './header-actions';
import { HeaderStats } from './header-stats';
import { FilterInput } from './filter-input';
import { SelectionBar } from './selection-bar';
import type { LibraryHeaderProps } from './types';
import type { LibraryLayout } from '../library-page/use-library-layout';
import { useLibraryStore } from '../../../stores/library-store';

export function LibraryHeader({
  canExport,
  layout,
  filteredTracks,
  exportableTrackCount,
  totalTrackCount,
  totalDuration,
  totalSizeLabel,
  filterQuery,
  starredOnly,
  playbackTrackCount,
  selectedIds,
  deleteConfirm,
  exportablePlaylistCount,
  manualPlaylists,
  playlistCount,
  playlistPickerPos,
  t,
  onPlayAll,
  onImport,
  onExportLibrary,
  onDeselectAll,
  onOpenPlaylistPicker,
  onSetDeleteConfirm,
  onDelete,
  onBulkAddToPlaylist,
}: LibraryHeaderProps & { layout: LibraryLayout }) {
  const hasAnyTracks = totalTrackCount > 0;
  const hasExportableContent = exportableTrackCount > 0 || exportablePlaylistCount > 0;
  const showActionRow = hasAnyTracks || playlistCount > 0;

  return (
    <div
      className="shrink-0"
      style={{
        padding: `var(--desktop-page-top) ${layout.contentPaddingX}px 16px`,
      }}
    >
      <div
        className="flex min-w-0 flex-col"
        style={{
          alignItems: 'stretch',
          gap: layout.compact ? '12px' : '14px',
          width: '100%',
        }}
      >
        <HeaderStats
          compact={layout.compact}
          hasActiveFilter={starredOnly || Boolean(filterQuery)}
          filteredCount={filteredTracks.length}
          totalDuration={totalDuration}
          totalSizeLabel={totalSizeLabel}
          totalTrackCount={totalTrackCount}
          title={t('title')}
        />

        {showActionRow && (
          <div
            className="flex min-w-0"
            style={{
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            <div className="min-w-0" style={{ flex: '0 1 auto' }}>
              {selectedIds.size > 0 ? (
                <SelectionBar
                  compact={layout.compact}
                  deleteConfirm={deleteConfirm}
                  manualPlaylists={manualPlaylists}
                  playlistPickerPos={playlistPickerPos}
                  selectedIds={selectedIds}
                  t={t}
                  onDeselectAll={onDeselectAll}
                  onOpenPlaylistPicker={onOpenPlaylistPicker}
                  onSetDeleteConfirm={onSetDeleteConfirm}
                  onDelete={onDelete}
                  onBulkAddToPlaylist={onBulkAddToPlaylist}
                />
              ) : (
                <HeaderActions
                  compact={false}
                  canPlay={playbackTrackCount > 0}
                  hasAnyTracks={hasAnyTracks}
                  hasExportableContent={canExport && hasExportableContent}
                  t={t}
                  onPlayAll={onPlayAll}
                  onImport={onImport}
                  onExportLibrary={onExportLibrary}
                />
              )}
            </div>

            {/* Starred and the filter wrap together, so the second row is one aligned bar instead of a loose search box. */}
            <div
              className="flex min-w-0 items-center"
              style={{ flex: '1 1 280px', gap: '10px', justifyContent: 'flex-end' }}
            >
              <button
                type="button"
                aria-pressed={starredOnly}
                onClick={() => useLibraryStore.setState({ starredOnly: !starredOnly })}
                className="download-btn inline-flex shrink-0 items-center gap-2 cursor-pointer"
                style={{
                  height: '36px',
                  padding: '0 14px',
                  borderRadius: '20px',
                  border: '1px solid var(--border)',
                  background: starredOnly ? 'var(--glow-strong)' : 'var(--bg-surface)',
                  color: starredOnly ? 'var(--white)' : 'var(--text-secondary)',
                  fontSize: '0.78rem',
                  fontFamily: 'inherit',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={starredOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                  <path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" />
                </svg>
                {t('starred')}
              </button>

              <div className="min-w-0" style={{ flex: '1 1 180px', maxWidth: '560px' }}>
                <FilterInput filterQuery={filterQuery} placeholder={t('filterPlaceholder')} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
