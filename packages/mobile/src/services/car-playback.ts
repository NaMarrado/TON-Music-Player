import type { PlaybackQueueSourceDescriptor, PlaylistTrackEntry, Track } from '@ton/core';
import * as FileSystem from 'expo-file-system';
import { getDb, initDatabase } from './database';
import { getPlaylistTracks } from './db-queries';
import { playTracks } from './playback-bridge/controls/transport';
import { parseCarPlaybackMediaId } from './car-media-id';

let requestGeneration = 0;

async function keepReadableTracks<T extends Track>(tracks: T[]): Promise<T[]> {
  const readable = await Promise.all(
    tracks.map(async (track) => {
      if (!track.file_path) return false;
      return (await FileSystem.getInfoAsync(track.file_path).catch(() => ({ exists: false }))).exists;
    }),
  );
  return tracks.filter((_, index) => readable[index]);
}

async function getCarLibraryTracks(): Promise<Track[]> {
  const tracks = await getDb().getAllAsync<Track>(
    `SELECT *
     FROM tracks
     WHERE file_path IS NOT NULL AND TRIM(file_path) <> ''
    ORDER BY COALESCE(title, '') COLLATE NOCASE ASC,
             COALESCE(artist, '') COLLATE NOCASE ASC,
             id ASC`,
  );
  return keepReadableTracks(tracks);
}

function getPlaylistSelectionIndex(
  tracks: PlaylistTrackEntry[],
  playlistTrackId: number,
): number {
  return tracks.findIndex((track) => track.playlist_track_id === playlistTrackId);
}

export async function playCarMediaId(mediaId: string): Promise<void> {
  const request = parseCarPlaybackMediaId(mediaId);
  if (!request) {
    throw new Error(`Unsupported Android Auto media ID: ${mediaId}`);
  }

  const generation = ++requestGeneration;
  await initDatabase();

  let tracks: Track[];
  let startIndex: number;
  let sourceDescriptor: PlaybackQueueSourceDescriptor;

  if (request.kind === 'library') {
    tracks = await getCarLibraryTracks();
    startIndex = tracks.findIndex((track) => track.id === request.trackId);
    sourceDescriptor = {
      kind: 'library',
      sort_by: 'title',
      sort_order: 'asc',
    };
  } else {
    const playlistTracks = await keepReadableTracks(await getPlaylistTracks(request.playlistId));
    tracks = playlistTracks;
    startIndex = getPlaylistSelectionIndex(playlistTracks, request.playlistTrackId);
    sourceDescriptor = { kind: 'playlist', source_id: request.playlistId };
  }

  if (generation !== requestGeneration) return;
  if (startIndex < 0 || tracks.length === 0) {
    throw new Error(`Android Auto selection is no longer available: ${mediaId}`);
  }

  await playTracks(tracks, startIndex, sourceDescriptor);
}
