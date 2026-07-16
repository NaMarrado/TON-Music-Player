import { matchesTrackFilter, type PlaylistTrackEntry } from '@ton/core';

export function filterTracks(
  tracks: PlaylistTrackEntry[],
  filterQuery: string,
): PlaylistTrackEntry[] {
  if (!filterQuery) {
    return tracks;
  }

  return tracks.filter((track) => matchesTrackFilter(track, filterQuery));
}
