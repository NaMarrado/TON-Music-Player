import type { PlaylistTrackEntry } from '../../types';
import { matchesTrackFilter } from './library';

export type PlaylistSortField = '#' | 'title' | 'artist' | 'downloaded_at' | 'time' | null;

export function getFilteredPlaylistTracks(
  tracks: PlaylistTrackEntry[],
  filterQuery: string,
  sortBy: PlaylistSortField,
  sortOrder: 'asc' | 'desc',
): PlaylistTrackEntry[] {
  const filtered = filterQuery.trim()
    ? tracks.filter((track) => matchesTrackFilter(track, filterQuery))
    : [...tracks];

  if (sortBy == null) return filtered;
  if (sortBy === '#') return sortOrder === 'asc' ? filtered : filtered.reverse();

  const direction = sortOrder === 'asc' ? 1 : -1;
  return filtered.sort((left, right) => {
    let comparison = 0;
    if (sortBy === 'title' || sortBy === 'artist') {
      comparison = (left[sortBy] ?? '').localeCompare(right[sortBy] ?? '') * direction;
    } else if (sortBy === 'downloaded_at') {
      const leftValue = left.downloaded_at;
      const rightValue = right.downloaded_at;
      if (leftValue == null && rightValue != null) comparison = 1;
      else if (leftValue != null && rightValue == null) comparison = -1;
      else comparison = ((leftValue ?? 0) - (rightValue ?? 0)) * direction;
    } else {
      comparison = ((left.duration_ms ?? 0) - (right.duration_ms ?? 0)) * direction;
    }

    return comparison || left.playlist_track_id - right.playlist_track_id;
  });
}
