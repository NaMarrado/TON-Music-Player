import type { Track } from '@ton/core';
import { getTracksByIds } from '../db-queries';
import type { PlaybackRuntimeTrack } from '../playback-runtime';

export type QueueTrackRef = { track_id: number };

export function trackToRntp(track: Track, uniqueSuffix?: string): PlaybackRuntimeTrack {
  return {
    id: uniqueSuffix ? `${track.id}-${uniqueSuffix}` : String(track.id),
    url: track.file_path,
    title: track.title ?? '',
    artist: track.artist ?? '',
    album: track.album ?? undefined,
    artwork: track.cover_art_path ?? undefined,
    duration: (track.duration_ms ?? 0) / 1000,
  };
}

export async function buildRntpQueue(
  items: QueueTrackRef[],
  startIndex = 0,
): Promise<PlaybackRuntimeTrack[]> {
  const trackIds = items.map((item) => item.track_id);
  const tracks = await getTracksByIds(trackIds);
  const trackMap = new Map(tracks.map((track) => [track.id, track]));
  const ordered: PlaybackRuntimeTrack[] = [];

  for (let index = 0; index < items.length; index++) {
    const track = trackMap.get(items[index].track_id);
    if (track) {
      ordered.push(trackToRntp(track, `${startIndex + index}`));
    }
  }

  return ordered;
}
