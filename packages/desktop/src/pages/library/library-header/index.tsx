import { HeaderActions } from './header-actions';
import { HeaderStats } from './header-stats';
import { FilterInput } from './filter-input';
import { SelectionBar } from './selection-bar';
import type { LibraryHeaderProps } from './types';
import type { LibraryLayout } from '../library-page/use-library-layout';

export function LibraryHeader({
  canExport,
  layout,
  filteredTracks,
  exportableTrackCount,
  totalTrackCount,
  totalDuration,
  filterQuery,
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
        padding: `44px ${layout.contentPaddingX}px 16px`,
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
          filterQuery={filterQuery}
          filteredCount={filteredTracks.length}
          totalDuration={totalDuration}
          totalTrackCount={totalTrackCount}
          title={t('title')}
        />

        {showActionRow && (
          <div
            className="flex min-w-0"
            style={{
              alignItems: 'center',
              gap: '10px',
              justifyContent: 'space-between',
              flexWrap: layout.compact ? 'wrap' : 'nowrap',
              width: '100%',
            }}
          >
            <div className="min-w-0 flex-1">
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
                  canPlay={filteredTracks.length > 0}
                  hasAnyTracks={hasAnyTracks}
                  hasExportableContent={canExport && hasExportableContent}
                  t={t}
                  onPlayAll={onPlayAll}
                  onImport={onImport}
                  onExportLibrary={onExportLibrary}
                />
              )}
            </div>

            <div
              className="min-w-0"
              style={{
                flex: layout.compact ? '1 1 100%' : '0 1 360px',
                maxWidth: layout.compact ? '100%' : '360px',
              }}
            >
              <FilterInput
                compact={false}
                filterQuery={filterQuery}
                placeholder={t('filterPlaceholder')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
