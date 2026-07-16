import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';
import type { SortColumn, SortDir } from '../../sortable-track-row';
import { filterTracks } from './filter-tracks';
import { sortTracks } from './sort-tracks';
import {
  loadPlaylistSortPreference,
  savePlaylistSortPreference,
} from './sort-preference';
import { useTrackSelection } from './use-track-selection';

export function usePlaylistViewState(playlistId: number, tracks: PlaylistTrackEntry[]) {
  const [filterQuery, setFilterQuery] = useState('');
  const initialSort = loadPlaylistSortPreference(playlistId);
  const [sortBy, setSortBy] = useState<SortColumn>(initialSort.sortBy);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort.sortDir);

  useEffect(() => {
    const preference = loadPlaylistSortPreference(playlistId);
    setSortBy(preference.sortBy);
    setSortDir(preference.sortDir);
  }, [playlistId]);

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
      const applySort = (nextSortBy: SortColumn, nextSortDir: SortDir) => {
        setSortBy(nextSortBy);
        setSortDir(nextSortDir);
        savePlaylistSortPreference(playlistId, {
          sortBy: nextSortBy,
          sortDir: nextSortDir,
        });
      };

      if (column === '#') {
        if (sortBy === '#') {
          applySort(null, 'asc');
        } else {
          applySort('#', 'desc');
        }
        return;
      }

      if (sortBy === column) {
        if (sortDir === 'asc') {
          applySort(sortBy, 'desc');
        } else {
          applySort(null, 'asc');
        }
        return;
      }

      applySort(column, 'asc');
    },
    [playlistId, sortBy, sortDir],
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
