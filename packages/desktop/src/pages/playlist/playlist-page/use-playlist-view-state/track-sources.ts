import type { PlaylistTrackEntry } from '@ton/core';
import type { SortColumn, SortDir } from '../../sortable-track-row';
import { filterTracks } from './filter-tracks';
import { sortTracks } from './sort-tracks';

export function getPlaylistTrackSources(
  tracks: PlaylistTrackEntry[],
  filterQuery: string,
  sortBy: SortColumn,
  sortDir: SortDir,
): { playbackTracks: PlaylistTrackEntry[]; displayTracks: PlaylistTrackEntry[] } {
  const playbackTracks = sortTracks(tracks, sortBy, sortDir);
  return { playbackTracks, displayTracks: filterTracks(playbackTracks, filterQuery) };
}

/** Membership id distinguishes repeated songs in a playlist. */
export function getPlaylistPlaybackIndex(tracks: PlaylistTrackEntry[], playlistTrackId: number): number {
  return tracks.findIndex((track) => track.playlist_track_id === playlistTrackId);
}
