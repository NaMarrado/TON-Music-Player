import { getFilteredTracks, matchesTrackFilter, type SortField, type Track } from '@ton/core';

export function getLibraryTrackSources<T extends Track>(
  tracks: T[],
  filterQuery: string,
  sortBy: SortField,
  sortOrder: 'asc' | 'desc',
  starredOnly: boolean,
): { playbackTracks: T[]; filteredTracks: T[] } {
  const source = starredOnly ? tracks.filter((track) => (track.rating ?? 0) > 0) : tracks;
  const playbackTracks = getFilteredTracks(source, '', sortBy, sortOrder);
  const filteredTracks = filterQuery
    ? playbackTracks.filter((track) => matchesTrackFilter(track, filterQuery))
    : playbackTracks;
  return { playbackTracks, filteredTracks };
}

export function getLibraryPlaybackIndex(tracks: Track[], trackId: number): number {
  return tracks.findIndex((track) => track.id === trackId);
}
