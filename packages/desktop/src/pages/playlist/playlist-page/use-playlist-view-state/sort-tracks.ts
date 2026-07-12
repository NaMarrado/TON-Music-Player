import type { PlaylistTrackEntry } from '@ton/core';
import type { SortColumn, SortDir } from '../../sortable-track-row';

export function sortTracks(
  tracks: PlaylistTrackEntry[],
  sortBy: SortColumn,
  sortDir: SortDir,
): PlaylistTrackEntry[] {
  if (!sortBy) {
    return tracks;
  }

  if (sortBy === '#') {
    return sortDir === 'asc' ? tracks : [...tracks].reverse();
  }

  const sorted = [...tracks];
  const dir = sortDir === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'title': {
        const aValue = (a.title || '').toLowerCase();
        const bValue = (b.title || '').toLowerCase();
        return aValue < bValue ? -dir : aValue > bValue ? dir : 0;
      }
      case 'artist': {
        const aValue = (a.artist || '').toLowerCase();
        const bValue = (b.artist || '').toLowerCase();
        return aValue < bValue ? -dir : aValue > bValue ? dir : 0;
      }
      case 'time':
        return ((a.duration_ms || 0) - (b.duration_ms || 0)) * dir;
      default:
        return 0;
    }
  });

  return sorted;
}
