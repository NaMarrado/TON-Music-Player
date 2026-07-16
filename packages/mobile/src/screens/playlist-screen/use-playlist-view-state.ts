import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getFilteredPlaylistTracks,
  type PlaylistSortField,
  type PlaylistTrackEntry,
} from '@ton/core';
import { getSetting, setSetting } from '../../services/db-queries';

const SORT_SETTING_PREFIX = 'playlist:sort:';
const SORT_FIELDS = new Set<PlaylistSortField>([
  null,
  '#',
  'title',
  'artist',
  'downloaded_at',
  'time',
]);

interface PlaylistSortPreference {
  sortBy: PlaylistSortField;
  sortOrder: 'asc' | 'desc';
}

const DEFAULT_SORT: PlaylistSortPreference = { sortBy: null, sortOrder: 'asc' };

function parseSortPreference(value: string | null): PlaylistSortPreference {
  if (!value) return DEFAULT_SORT;
  try {
    const parsed = JSON.parse(value) as Partial<PlaylistSortPreference>;
    if (
      SORT_FIELDS.has(parsed.sortBy as PlaylistSortField)
      && (parsed.sortOrder === 'asc' || parsed.sortOrder === 'desc')
    ) {
      return {
        sortBy: parsed.sortBy as PlaylistSortField,
        sortOrder: parsed.sortOrder,
      };
    }
  } catch {
    // Invalid local UI state should not prevent opening the playlist.
  }
  return DEFAULT_SORT;
}

export function usePlaylistViewState(playlistId: number, tracks: PlaylistTrackEntry[]) {
  const [filterQuery, setFilterQuery] = useState('');
  const [preference, setPreference] = useState<PlaylistSortPreference>(DEFAULT_SORT);

  useEffect(() => {
    let active = true;
    void getSetting(`${SORT_SETTING_PREFIX}${playlistId}`).then((value) => {
      if (active) setPreference(parseSortPreference(value));
    });
    return () => { active = false; };
  }, [playlistId]);

  const applySort = useCallback((sortBy: PlaylistSortField) => {
    setPreference((current) => {
      const next = sortBy == null
        ? DEFAULT_SORT
        : {
          sortBy,
          sortOrder: current.sortBy === sortBy && current.sortOrder === 'asc'
            ? 'desc' as const
            : 'asc' as const,
        };
      void setSetting(`${SORT_SETTING_PREFIX}${playlistId}`, JSON.stringify(next));
      return next;
    });
  }, [playlistId]);

  const displayTracks = useMemo(() => getFilteredPlaylistTracks(
    tracks,
    filterQuery,
    preference.sortBy,
    preference.sortOrder,
  ), [filterQuery, preference.sortBy, preference.sortOrder, tracks]);

  return {
    applySort,
    displayTracks,
    filterQuery,
    isOriginalOrder: preference.sortBy == null,
    setFilterQuery,
    sortBy: preference.sortBy,
    sortOrder: preference.sortOrder,
  };
}
