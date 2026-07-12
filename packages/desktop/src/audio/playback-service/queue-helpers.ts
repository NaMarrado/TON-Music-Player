import type { QueueItem, Track } from '@ton/core';

export function buildQueueItems(tracks: Track[]) {
  return tracks.map((track, index) => ({
    id: `${track.id}-${index}-${Date.now()}`,
    track_id: track.id,
    added_by: 'user' as const,
    file_path: track.file_path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration_ms: track.duration_ms,
    cover_art_path: track.cover_art_path,
    loudness_gain: track.loudness_gain,
    ...('playlist_track_id' in track
      ? { playlist_track_id: (track as Track & { playlist_track_id: number }).playlist_track_id }
      : {}),
  }));
}

export function getQueueItemTrackSnapshot(item: QueueItem): Track | null {
  if (!item.file_path) {
    return null;
  }

  return {
    id: item.track_id,
    file_path: item.file_path,
    file_hash: null,
    content_hash_sha256: null,
    file_size: null,
    file_mtime: null,
    title: item.title ?? null,
    artist: item.artist ?? null,
    album: item.album ?? null,
    album_artist: null,
    track_number: null,
    disc_number: null,
    duration_ms: item.duration_ms ?? null,
    genre: null,
    year: null,
    bitrate: null,
    sample_rate: null,
    format: null,
    cover_art_path: item.cover_art_path ?? null,
    loudness_lufs: null,
    loudness_gain: item.loudness_gain ?? null,
    youtube_id: null,
    spotify_id: null,
    soundcloud_id: null,
    source_url: null,
    play_count: 0,
    last_played_at: null,
    rating: null,
    in_library: 1,
    added_at: 0,
    scanned_at: 0,
  };
}

export function shuffleArray<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
}
