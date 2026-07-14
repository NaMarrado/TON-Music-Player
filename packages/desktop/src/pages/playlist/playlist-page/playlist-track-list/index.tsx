import { EmptyPlaylist } from './empty-state';
import { SortablePlaylistTrackList } from './sortable-track-list';
import { StaticPlaylistTrackList } from './static-track-list';
import type { PlaylistTrackListProps } from './types';

export function PlaylistTrackList({
  layout,
  locale,
  t,
  tracks,
  displayTracks,
  isSmart,
  isSorted,
  isFiltered,
  allSelected,
  selectedIds,
  sortBy,
  sortDir,
  onSort,
  onSelectAll,
  onPlayTrack,
  onToggleSelect,
  playingPtId,
  sensors,
  sortableIds,
  onDragEnd,
}: PlaylistTrackListProps) {
  const useStaticList = isSmart || isSorted || isFiltered;

  if (tracks.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: `8px ${layout.contentPaddingX}px 120px` }}>
        <EmptyPlaylist t={t} />
      </div>
    );
  }

  if (useStaticList) {
    return (
      <StaticPlaylistTrackList
        layout={layout}
        locale={locale}
        t={t}
        isSmart={isSmart}
        allSelected={allSelected}
        onSelectAll={onSelectAll}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={onSort}
        displayTracks={displayTracks}
        playingPtId={playingPtId}
        selectedIds={selectedIds}
        onPlayTrack={onPlayTrack}
        onToggleSelect={onToggleSelect}
      />
    );
  }

  return (
      <SortablePlaylistTrackList
        layout={layout}
        locale={locale}
        t={t}
        allSelected={allSelected}
        onSelectAll={onSelectAll}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={onSort}
        sensors={sensors}
        onDragEnd={onDragEnd}
        sortableIds={sortableIds}
        tracks={tracks}
        playingPtId={playingPtId}
        selectedIds={selectedIds}
        onPlayTrack={onPlayTrack}
        onToggleSelect={onToggleSelect}
      />
  );
}
