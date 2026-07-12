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
      doAddToLibrary,
      handleDelete,
      handleExport,
      handleImport,
      handlePlayAll,
      handlePlayTrack,
      handleRemoveSelected,
      libraryCounts,
      openAddToLibrary,
    },
    dnd: { handleDragEnd, sensors },
    pageData: {
      isLoading,
      playingPtId,
      playlist,
      setShowAddToLibrary,
      setShowDeleteConfirm,
      setShowEditDialog,
      setShowRemoveConfirm,
      showAddToLibrary,
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
        onAddToLibrary={async () => {
          await openAddToLibrary();
          setShowAddToLibrary(true);
        }}
      />

      <PlaylistDialogSection
        playlist={playlist}
        t={t}
        showDeleteConfirm={showDeleteConfirm}
        showRemoveConfirm={showRemoveConfirm}
        showAddToLibrary={showAddToLibrary}
        showEditDialog={showEditDialog}
        libraryCounts={libraryCounts}
        onCloseDelete={() => setShowDeleteConfirm(false)}
        onCloseRemove={() => setShowRemoveConfirm(false)}
        onCloseAddToLibrary={() => setShowAddToLibrary(false)}
        onCloseEdit={() => setShowEditDialog(false)}
        onConfirmDelete={handleDelete}
        onConfirmRemove={async () => {
          setShowRemoveConfirm(false);
          await handleRemoveSelected();
        }}
        onAddOnlyNew={async () => {
          setShowAddToLibrary(false);
          await doAddToLibrary(false);
        }}
        onAddAll={async () => {
          setShowAddToLibrary(false);
          await doAddToLibrary(true);
        }}
      />

      <PlaylistTrackListSection
        layout={layout}
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
