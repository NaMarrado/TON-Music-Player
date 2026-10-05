import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { TrackContextMenu } from '../context-menu';
import { editTrackInStudio } from '../../studio/studio-store';
import { LibraryHeader } from '../library-header';
import { TrackListView } from '../track-list-view';
import { EmptyFilterState, EmptyLibraryState, EmptyStarredState } from './empty-states';
import { useLibraryPageActions } from './use-library-page-actions';
import { useLibraryPageData } from './use-library-page-data';
import { useLibraryLayout } from './use-library-layout';
import { useLibraryViewState } from './use-library-view-state';
import { PlaylistDuplicateDialog } from './playlist-duplicate-dialog';

export function LibraryPage() {
  const { i18n, t } = useTranslation('pages/library');
  const navigate = useNavigate();
  const layout = useLibraryLayout();
  const {
    canExport,
    exportablePlaylistCount,
    exportableTrackCount,
    filterQuery,
    manualPlaylists,
    playlistCount,
    refreshExportSummary,
    sortBy,
    sortOrder,
    starredOnly,
    tracks,
  } = useLibraryPageData();

  const {
    contextMenu,
    deleteConfirm,
    filteredTracks,
    playbackTracks,
    playbackTracksRef,
    handleSelectAll,
    handleToggleSelect,
    playlistPickerPos,
    selectedIds,
    setContextMenu,
    setDeleteConfirm,
    setPlaylistPickerPos,
    setSelectedIds,
    totalDuration,
    totalSizeLabel,
  } = useLibraryViewState(tracks, filterQuery, sortBy, sortOrder, starredOnly);

  const {
    handleAddToPlaylist,
    handleBulkAddToPlaylist,
    handleContextMenu,
    handleDelete,
    handleDeleteFromMenu,
    handleExportLibrary,
    handleImport,
    handleOpenPlaylistPicker,
    handlePlayAll,
    handlePlayTrack,
    duplicateDialog,
    handleAddAllDuplicates,
    handleAddCurrentDuplicate,
    handleCancelDuplicate,
    handleSkipDuplicate,
  } = useLibraryPageActions({
    contextMenu,
    playbackTracksRef,
    selectedIds,
    setContextMenu,
    setDeleteConfirm,
    setPlaylistPickerPos,
    setSelectedIds,
    t,
    refreshExportSummary,
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <LibraryHeader
        layout={layout}
        filteredTracks={filteredTracks}
        totalTrackCount={tracks.length}
        totalDuration={totalDuration}
        totalSizeLabel={totalSizeLabel}
        filterQuery={filterQuery}
        starredOnly={starredOnly}
        playbackTrackCount={playbackTracks.length}
        selectedIds={selectedIds}
        deleteConfirm={deleteConfirm}
        canExport={canExport}
        exportablePlaylistCount={exportablePlaylistCount}
        exportableTrackCount={exportableTrackCount}
        manualPlaylists={manualPlaylists}
        playlistCount={playlistCount}
        playlistPickerPos={playlistPickerPos}
        t={t}
        onPlayAll={handlePlayAll}
        onImport={handleImport}
        onExportLibrary={handleExportLibrary}
        onDeselectAll={() => setSelectedIds(new Set())}
        onOpenPlaylistPicker={handleOpenPlaylistPicker}
        onSetDeleteConfirm={setDeleteConfirm}
        onDelete={handleDelete}
        onBulkAddToPlaylist={handleBulkAddToPlaylist}
      />

      <div className="flex-1 min-h-0" style={{ padding: `8px ${layout.contentPaddingX}px 0` }}>
        {tracks.length === 0 ? (
          <EmptyLibraryState
            onImport={handleImport}
            onSearchMusic={() => navigate('/search')}
            t={t}
          />
        ) : starredOnly && playbackTracks.length === 0 ? (
          <EmptyStarredState t={t} />
        ) : filteredTracks.length === 0 ? (
          <EmptyFilterState t={t} />
        ) : (
          <TrackListView
            layout={layout}
            locale={i18n.resolvedLanguage || i18n.language}
            tracks={filteredTracks}
            selectedIds={selectedIds}
            t={t}
            onPlayTrack={handlePlayTrack}
            onContextMenu={handleContextMenu}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
          />
        )}
      </div>

      {contextMenu && (
        <TrackContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          playlists={manualPlaylists}
          onAddToPlaylist={handleAddToPlaylist}
          onDelete={handleDeleteFromMenu}
          onEditInStudio={() => {
            const track = tracks.find((candidate) => candidate.id === contextMenu.trackId);
            setContextMenu(null);
            if (!track) return;
            editTrackInStudio(track);
            navigate('/studio');
          }}
          t={t}
        />
      )}

      {duplicateDialog && (
        <PlaylistDuplicateDialog
          state={duplicateDialog}
          onAddAll={handleAddAllDuplicates}
          onAddCurrent={handleAddCurrentDuplicate}
          onCancel={handleCancelDuplicate}
          onSkip={handleSkipDuplicate}
          t={t}
        />
      )}

    </div>
  );
}
