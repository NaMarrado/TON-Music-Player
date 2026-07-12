import type { PlaylistTrackEntry } from '@ton/core';

export function filterTracks(
  tracks: PlaylistTrackEntry[],
  filterQuery: string,
): PlaylistTrackEntry[] {
  if (!filterQuery) {
    return tracks;
  }

  const query = filterQuery.toLowerCase();
  return tracks.filter(
    (track) =>
      track.title?.toLowerCase().includes(query)
      || track.artist?.toLowerCase().includes(query)
      || track.album?.toLowerCase().includes(query),
  );
}
