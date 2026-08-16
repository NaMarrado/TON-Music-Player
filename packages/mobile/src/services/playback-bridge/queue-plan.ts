import {
  createRollingQueueWindow,
  type QueueItem,
  type Track,
} from '@ton/core';

export interface PlaybackQueuePlan {
  currentIndex: number;
  items: QueueItem[];
  originalItems: QueueItem[];
  selectedTrack: Track;
  trackByItemId: Map<string, Track>;
  nextQueueSerial: number;
}

export interface QueueModePlan<T> {
  currentIndex: number;
  items: T[];
  requiresFullReplacement: boolean;
}

export function createPlaybackQueuePlan(
  tracks: Track[],
  startIndex: number,
  generation: number,
  shuffleEnabled: boolean,
  random: () => number = Math.random,
): PlaybackQueuePlan {
  if (tracks.length === 0 || startIndex < 0 || startIndex >= tracks.length) {
    throw new Error('invalid-playback-queue-source');
  }
  const originalItems: QueueItem[] = tracks.map((track, index) => ({
    id: `${track.id}-g${generation}-s${index}`,
    track_id: track.id,
    added_by: 'user',
    playlist_track_id: 'playlist_track_id' in track
      ? Number(track.playlist_track_id)
      : undefined,
    file_path: track.file_path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration_ms: track.duration_ms,
    cover_art_path: track.cover_art_path,
    loudness_gain: track.loudness_gain,
    youtube_id: track.youtube_id,
  }));
  const window = createRollingQueueWindow(
    originalItems,
    startIndex,
    generation,
    shuffleEnabled,
    random,
  );
  const trackByItemId = new Map(
    window.items.map((item) => [item.id, tracks[item.source_index ?? startIndex]]),
  );

  return {
    currentIndex: window.currentIndex,
    items: window.items,
    originalItems,
    selectedTrack: tracks[startIndex],
    trackByItemId,
    nextQueueSerial: window.nextSerial,
  };
}

export function shuffleQueueItems<T>(items: T[], random: () => number = Math.random): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
}

export function enableQueueShuffle<T>(
  items: T[],
  currentIndex: number,
  random: () => number = Math.random,
): QueueModePlan<T> {
  if (items.length <= 1) {
    return { currentIndex, items: [...items], requiresFullReplacement: false };
  }

  const prefix = currentIndex >= 0 ? items.slice(0, currentIndex + 1) : [];
  const upcoming = currentIndex >= 0 ? items.slice(currentIndex + 1) : [...items];
  shuffleQueueItems(upcoming, random);
  return {
    currentIndex,
    items: [...prefix, ...upcoming],
    requiresFullReplacement: false,
  };
}

export function disableQueueShuffle<T extends { id: string }>(
  items: T[],
  originalOrder: T[],
  currentIndex: number,
): QueueModePlan<T> {
  const restored = originalOrder.length === items.length ? [...originalOrder] : [...items];
  const currentItem = items[currentIndex];
  const restoredIndex = currentItem
    ? restored.findIndex((item) => item.id === currentItem.id)
    : currentIndex;
  const nextIndex = restoredIndex >= 0 ? restoredIndex : Math.max(0, currentIndex);
  const prefixUnchanged = nextIndex === currentIndex
    && currentIndex >= 0
    && items.slice(0, currentIndex + 1).every((item, index) => restored[index]?.id === item.id);

  return {
    currentIndex: nextIndex,
    items: restored,
    requiresFullReplacement: !prefixUnchanged,
  };
}
