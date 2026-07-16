import type { SortColumn, SortDir } from '../../sortable-track-row';

interface PlaylistSortPreference {
  sortBy: SortColumn;
  sortDir: SortDir;
}

const STORAGE_KEY_PREFIX = 'playlist:sort:';
const SORT_COLUMNS = new Set<SortColumn>([
  null,
  '#',
  'title',
  'artist',
  'downloaded_at',
  'time',
]);
const DEFAULT_PREFERENCE: PlaylistSortPreference = { sortBy: null, sortDir: 'asc' };

export function loadPlaylistSortPreference(playlistId: number): PlaylistSortPreference {
  if (playlistId <= 0) return DEFAULT_PREFERENCE;
  try {
    const stored = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}${playlistId}`) ?? 'null') as {
      sortBy?: unknown;
      sortDir?: unknown;
    } | null;
    if (
      stored
      && SORT_COLUMNS.has(stored.sortBy as SortColumn)
      && (stored.sortDir === 'asc' || stored.sortDir === 'desc')
    ) {
      return { sortBy: stored.sortBy as SortColumn, sortDir: stored.sortDir };
    }
  } catch {
    // Invalid renderer storage should not prevent the playlist from opening.
  }
  return DEFAULT_PREFERENCE;
}

export function savePlaylistSortPreference(
  playlistId: number,
  preference: PlaylistSortPreference,
): void {
  if (playlistId <= 0) return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${playlistId}`, JSON.stringify(preference));
  } catch {
    // Sorting must remain usable even when renderer storage is unavailable.
  }
}
