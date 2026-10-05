import assert from 'node:assert/strict';
import test from 'node:test';
import type { Track, PlaylistTrackEntry } from '../../packages/core/src/types/index.ts';
import {
  getLibraryPlaybackIndex,
  getLibraryTrackSources,
} from '../../packages/desktop/src/pages/library/library-page/track-sources.ts';
import {
  getPlaylistPlaybackIndex,
  getPlaylistTrackSources,
} from '../../packages/desktop/src/pages/playlist/playlist-page/use-playlist-view-state/track-sources.ts';

const libraryTracks = [
  { id: 1, title: 'Charlie', artist: 'One', rating: null, added_at: 30 },
  { id: 2, title: 'Alpha', artist: 'Two', rating: 4, added_at: 20 },
  { id: 3, title: 'Bravo', artist: 'Three', rating: 1, added_at: 10 },
] as Track[];

test('Library search changes visible rows without removing queue neighbors or changing click index', () => {
  const { playbackTracks, filteredTracks } = getLibraryTrackSources(libraryTracks, 'Bravo', 'title', 'asc', false);
  assert.deepEqual(filteredTracks.map((track) => track.id), [3]);
  assert.deepEqual(playbackTracks.map((track) => track.id), [2, 3, 1]);
  assert.equal(getLibraryPlaybackIndex(playbackTracks, filteredTracks[0].id), 1);
  assert.equal(getLibraryPlaybackIndex(playbackTracks, 999), -1);
  const noMatch = getLibraryTrackSources(libraryTracks, 'not a song', 'title', 'asc', false);
  assert.deepEqual(noMatch.filteredTracks, []);
  assert.deepEqual(noMatch.playbackTracks.map((track) => track.id), [2, 3, 1]);
  assert.deepEqual(libraryTracks.map((track) => track.id), [1, 2, 3]);
});

test('Library Starred narrows the playback source before presentation search using every positive rating', () => {
  const rows = [
    ...libraryTracks,
    { id: 4, title: 'Delta', rating: 0, added_at: 40 },
    { id: 5, title: 'Echo', rating: -1, added_at: 50 },
  ] as Track[];
  const { playbackTracks, filteredTracks } = getLibraryTrackSources(rows, 'Bravo', 'added_at', 'desc', true);
  assert.deepEqual(playbackTracks.map((track) => track.id), [2, 3]);
  assert.deepEqual(filteredTracks.map((track) => track.id), [3]);
  assert.equal(getLibraryPlaybackIndex(playbackTracks, 3), 1);
  assert.equal(getLibraryPlaybackIndex(playbackTracks, 1), -1);
  const noFavorites = getLibraryTrackSources(rows.filter((track) => (track.rating ?? 0) <= 0), '', 'title', 'asc', true);
  assert.deepEqual(noFavorites.playbackTracks, []);
  assert.deepEqual(noFavorites.filteredTracks, []);
});

const playlistTracks = [
  { ...libraryTracks[0], playlist_track_id: 11 },
  { ...libraryTracks[1], playlist_track_id: 12 },
  { ...libraryTracks[2], playlist_track_id: 13 },
  { ...libraryTracks[1], playlist_track_id: 14 },
] as PlaylistTrackEntry[];

test('playlist search retains sorted playback neighbors and resolves duplicate songs by membership id', () => {
  const { playbackTracks, displayTracks } = getPlaylistTrackSources(playlistTracks, 'Alpha', 'title', 'asc');
  assert.deepEqual(displayTracks.map((track) => track.playlist_track_id), [12, 14]);
  assert.deepEqual(playbackTracks.map((track) => track.playlist_track_id), [12, 14, 13, 11]);
  assert.equal(getPlaylistPlaybackIndex(playbackTracks, displayTracks[1].playlist_track_id), 1);
  assert.equal(getPlaylistPlaybackIndex(playbackTracks, 11), 3);
  assert.equal(getPlaylistPlaybackIndex(playbackTracks, 999), -1);
  assert.deepEqual(playlistTracks.map((track) => track.playlist_track_id), [11, 12, 13, 14]);
});

test('playlist position reversal and an empty search result leave the full source available', () => {
  const reversed = getPlaylistTrackSources(playlistTracks, 'Bravo', '#', 'desc');
  assert.deepEqual(reversed.playbackTracks.map((track) => track.playlist_track_id), [14, 13, 12, 11]);
  assert.deepEqual(reversed.displayTracks.map((track) => track.playlist_track_id), [13]);
  assert.equal(getPlaylistPlaybackIndex(reversed.playbackTracks, 13), 1);
  const noMatch = getPlaylistTrackSources(playlistTracks, 'not a song', null, 'asc');
  assert.deepEqual(noMatch.displayTracks, []);
  assert.deepEqual(noMatch.playbackTracks.map((track) => track.playlist_track_id), [11, 12, 13, 14]);
});
