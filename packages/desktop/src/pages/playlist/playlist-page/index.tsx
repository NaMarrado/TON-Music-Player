import { PlaylistDialogSection } from './playlist-dialog-section';
import { PlaylistHeaderSection } from './playlist-header-section';
import { PlaylistTrackListSection } from './playlist-track-list-section';
import { PlaylistLoadingState, PlaylistNotFoundState } from './states';
import { usePlaylistLayout } from './use-playlist-layout';
import { usePlaylistPageModel } from './use-playlist-page-model';

export function PlaylistPage() {
  const layout = usePlaylistLayout();
  const {
    actions: {
      handleDelete,
      handleExport,
      handleImport,
      handlePlayAll,
      handlePlayTrack,
      handleRemoveSelected,
    },
    dnd: { handleDragEnd, sensors },
    locale,
    pageData: {
      isLoading,
      playingPtId,
      playlist,
      setShowDeleteConfirm,
      setShowEditDialog,
      setShowRemoveConfirm,
      showDeleteConfirm,
      showEditDialog,
      showRemoveConfirm,
      sortableIds,
      tracks,
    },
    t,
    viewState: {
      allSelected,
      displayTracks,
      filterQuery,
      handleSelectAll,
      handleSort,
      handleToggleSelect,
      isFiltered,
      isSorted,
      selectedIds,
      setFilterQuery,
      sortBy,
      sortDir,
    },
  } = usePlaylistPageModel();

  if (isLoading) {
    return <PlaylistLoadingState />;
  }

  if (!playlist) {
    return <PlaylistNotFoundState />;
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PlaylistHeaderSection
        layout={layout}
        playlist={playlist}
        tracks={tracks}
        selectedCount={selectedIds.size}
        filterQuery={filterQuery}
        onFilterChange={setFilterQuery}
        t={t}
        onPlayAll={handlePlayAll}
        onEdit={() => setShowEditDialog(true)}
        onImport={handleImport}
        onExport={handleExport}
        onDelete={() => setShowDeleteConfirm(true)}
        onRemoveSelected={() => setShowRemoveConfirm(true)}
      />

      <PlaylistDialogSection
        playlist={playlist}
        t={t}
        showDeleteConfirm={showDeleteConfirm}
        showRemoveConfirm={showRemoveConfirm}
        showEditDialog={showEditDialog}
        onCloseDelete={() => setShowDeleteConfirm(false)}
        onCloseRemove={() => setShowRemoveConfirm(false)}
        onCloseEdit={() => setShowEditDialog(false)}
        onConfirmDelete={handleDelete}
        onConfirmRemove={async () => {
          setShowRemoveConfirm(false);
          await handleRemoveSelected();
        }}
      />

      <PlaylistTrackListSection
        layout={layout}
        locale={locale}
        t={t}
        tracks={tracks}
        displayTracks={displayTracks}
        isSmart={playlist.is_smart ?? false}
        isSorted={isSorted}
        isFiltered={isFiltered}
        allSelected={allSelected}
        selectedIds={selectedIds}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        onSelectAll={handleSelectAll}
        onPlayTrack={handlePlayTrack}
        onToggleSelect={handleToggleSelect}
        playingPtId={playingPtId}
        sensors={sensors}
        sortableIds={sortableIds}
        onDragEnd={handleDragEnd}
      />
    </div>
  );
}
