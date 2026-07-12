import { useCallback, useMemo, useRef, useState } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';
import type { SortColumn, SortDir } from '../../sortable-track-row';
import { filterTracks } from './filter-tracks';
import { sortTracks } from './sort-tracks';
import { useTrackSelection } from './use-track-selection';

export function usePlaylistViewState(tracks: PlaylistTrackEntry[]) {
  const [filterQuery, setFilterQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortColumn>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const filteredTracks = useMemo(
    () => filterTracks(tracks, filterQuery),
    [tracks, filterQuery],
  );
  const displayTracks = useMemo(
    () => sortTracks(filteredTracks, sortBy, sortDir),
    [filteredTracks, sortBy, sortDir],
  );
  const displayTracksRef = useRef(displayTracks);
  displayTracksRef.current = displayTracks;

  const {
    allSelected,
    clearSelection,
    handleSelectAll,
    handleToggleSelect,
    selectedIds,
  } = useTrackSelection({ tracks, displayTracksRef });

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (column === '#') {
        if (sortBy === '#') {
          setSortBy(null);
          setSortDir('asc');
        } else {
          setSortBy('#');
          setSortDir('desc');
        }
        return;
      }

      if (sortBy === column) {
        if (sortDir === 'asc') {
          setSortDir('desc');
        } else {
          setSortBy(null);
          setSortDir('asc');
        }
        return;
      }

      setSortBy(column);
      setSortDir('asc');
    },
    [sortBy, sortDir],
  );

  return {
    allSelected,
    clearSelection,
    displayTracks,
    displayTracksRef,
    filterQuery,
    handleSelectAll,
    handleSort,
    handleToggleSelect,
    isFiltered: filterQuery.length > 0,
    isSorted: sortBy !== null,
    selectedIds,
    setFilterQuery,
    sortBy,
    sortDir,
  };
}
