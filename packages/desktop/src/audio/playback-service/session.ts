import {
  PLAYBACK_SESSION_SETTING_KEY,
  parsePlaybackSessionSnapshot,
  type PlaybackSessionSnapshot,
  type QueueItem,
  type Track,
} from '@ton/core';
import { getActiveElement } from '../media-element-pool';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { restorePausedTrack } from './track-loading';

const POSITION_PERSIST_INTERVAL_MS = 3_000;
const SESSION_WRITE_DEBOUNCE_MS = 300;

let initialized = false;
let lastSerializedSession: string | null = null;
let writeChain = Promise.resolve();

export async function initializeDesktopPlaybackSession(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await restoreDesktopPlaybackSession().catch(() => {});
  startDesktopPlaybackSessionPersistence();
}

async function restoreDesktopPlaybackSession(): Promise<boolean> {
  const snapshot = parsePlaybackSessionSnapshot(
    await window.api.invoke('settings:get', PLAYBACK_SESSION_SETTING_KEY),
  );
  if (!snapshot) return false;

  const ids = [...new Set(snapshot.queue.map((item) => item.track_id))];
  const tracks = await window.api.invoke('library:list-summary-by-ids', ids);
  const trackMap = new Map(
    tracks.filter((track) => Boolean(track.file_path)).map((track) => [track.id, track]),
  );
  const queue = snapshot.queue.filter((item) => trackMap.has(item.track_id));
  if (!queue.length) {
    await window.api.invoke('settings:set', PLAYBACK_SESSION_SETTING_KEY, '');
    return false;
  }

  const previousCurrentItem = snapshot.queue[snapshot.current_index];
  const foundIndex = previousCurrentItem
    ? queue.findIndex((item) => item.id === previousCurrentItem.id)
    : 0;
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  const currentTrack = trackMap.get(queue[currentIndex].track_id);
  if (!currentTrack) return false;

  const hydratedQueue = queue.map((item) => hydrateQueueItem(item, trackMap.get(item.track_id)!));
  usePlaybackStore.setState({
    currentTrack,
    duration: (currentTrack.duration_ms ?? 0) / 1000,
    isPlaying: false,
    position: snapshot.position_seconds,
    repeat: snapshot.repeat,
    shuffle: snapshot.shuffle,
  });
  useQueueStore.setState({
    items: hydratedQueue,
    currentIndex,
    source: snapshot.source ?? 'user',
    originalOrder: snapshot.source_items,
    nextQueueSerial: snapshot.next_queue_serial,
    generation: 1,
  });
  await restorePausedTrack(currentTrack, snapshot.position_seconds);
  lastSerializedSession = serializeCurrentSession();
  return true;
}

function startDesktopPlaybackSessionPersistence(): void {
  let writeTimer: number | null = null;

  const flush = () => {
    writeChain = writeChain.then(async () => {
      const serialized = serializeCurrentSession();
      if (serialized === lastSerializedSession) return;
      await window.api.invoke('settings:set', PLAYBACK_SESSION_SETTING_KEY, serialized);
      lastSerializedSession = serialized;
    }).catch(() => {});
  };

  const schedule = () => {
    if (writeTimer != null) window.clearTimeout(writeTimer);
    writeTimer = window.setTimeout(() => {
      writeTimer = null;
      flush();
    }, SESSION_WRITE_DEBOUNCE_MS);
  };

  usePlaybackStore.subscribe(schedule);
  useQueueStore.subscribe(schedule);
  window.setInterval(() => {
    if (usePlaybackStore.getState().isPlaying) flush();
  }, POSITION_PERSIST_INTERVAL_MS);
  window.addEventListener('beforeunload', flush);
  schedule();
}

function serializeCurrentSession(): string {
  const playback = usePlaybackStore.getState();
  const queue = useQueueStore.getState();
  if (!playback.currentTrack || !queue.items.length || queue.currentIndex < 0) return '';

  let position = playback.position;
  try {
    const element = getActiveElement();
    if (Number.isFinite(element.currentTime)) position = element.currentTime;
  } catch {
    // The media pool can still be initializing during the first snapshot.
  }

  const snapshot: PlaybackSessionSnapshot = {
    queue: queue.items.map(toPersistentQueueItem),
    source_items: queue.originalOrder.map(toPersistentQueueItem),
    next_queue_serial: queue.nextQueueSerial,
    current_index: Math.min(queue.currentIndex, queue.items.length - 1),
    position_seconds: Math.max(0, Math.round(position)),
    repeat: playback.repeat,
    shuffle: playback.shuffle,
    source: queue.source,
  };
  return JSON.stringify(snapshot);
}

function hydrateQueueItem(item: QueueItem, track: Track): QueueItem {
  return {
    ...toPersistentQueueItem(item),
    file_path: track.file_path,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration_ms: track.duration_ms,
    cover_art_path: track.cover_art_path,
    loudness_gain: track.loudness_gain,
    youtube_id: track.youtube_id,
  };
}

function toPersistentQueueItem(item: QueueItem): QueueItem {
  return {
    id: item.id,
    track_id: item.track_id,
    added_by: item.added_by,
    ...(item.playlist_track_id != null ? { playlist_track_id: item.playlist_track_id } : {}),
    ...(item.source_index != null ? { source_index: item.source_index } : {}),
  };
}
