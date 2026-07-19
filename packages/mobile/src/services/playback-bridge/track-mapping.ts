import type { QueueItem, Track } from '@ton/core';
import { getTracksByIds } from '../db-queries';
import type { PlaybackRuntimeTrack } from '../playback-runtime';

export type QueueTrackRef = { id?: string; track_id: number };

export function trackToRntp(track: Track, uniqueSuffix?: string): PlaybackRuntimeTrack {
  return {
    id: uniqueSuffix ?? String(track.id),
    url: track.file_path,
    title: track.title ?? '',
    artist: track.artist ?? '',
    album: track.album ?? undefined,
    artwork: track.cover_art_path ?? undefined,
    duration: (track.duration_ms ?? 0) / 1000,
    loudnessGainDb: track.loudness_gain ?? 0,
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
      ordered.push(trackToRntp(track, items[index].id ?? `${startIndex + index}`));
    }
  }

  return ordered;
}

export async function hydrateMobileQueueItems(items: QueueItem[]): Promise<QueueItem[]> {
  const tracks = await getTracksByIds([...new Set(items.map((item) => item.track_id))]);
  const trackMap = new Map(tracks.map((track) => [track.id, track]));
  return items.map((item) => {
    const track = trackMap.get(item.track_id);
    return track ? {
      ...item,
      file_path: track.file_path,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration_ms: track.duration_ms,
      cover_art_path: track.cover_art_path,
      loudness_gain: track.loudness_gain,
      youtube_id: track.youtube_id,
    } : item;
  });
}
