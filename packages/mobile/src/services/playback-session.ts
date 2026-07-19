import {
  PLAYBACK_SESSION_SETTING_KEY,
  parsePlaybackSessionSnapshot,
  type PlaybackSessionSnapshot,
  type QueueItem,
  type Track,
} from '@ton/core';
import { AppState } from 'react-native';
import { setupPlayer } from './audio-player';
import { getSetting, getTracksByIds, setSetting } from './db-queries';
import { syncRepeatMode } from './playback-bridge/player-runtime';
import { trackToRntp } from './playback-bridge/track-mapping';
import {
  getPlaybackPosition,
  replacePlaybackQueue,
  seekPlayback,
  setPlaybackShuffleEnabled,
} from './playback-runtime';
import { usePlaybackStore } from '../stores/playback-store';
import { useQueueStore } from '../stores/queue-store';

const POSITION_PERSIST_INTERVAL_MS = 3_000;
const SESSION_WRITE_DEBOUNCE_MS = 300;

let stopPersistence: (() => void) | null = null;
let writeChain = Promise.resolve();
let lastSerializedSession: string | null = null;

export async function restoreMobilePlaybackSession(): Promise<boolean> {
  const snapshot = parsePlaybackSessionSnapshot(
    await getSetting(PLAYBACK_SESSION_SETTING_KEY),
  );
  if (!snapshot) return false;

  const trackIds = [...new Set(snapshot.queue.map((item) => item.track_id))];
  const tracks = await getTracksByIds(trackIds);
  const trackMap = new Map(
    tracks
      .filter((track) => Boolean(track.file_path))
      .map((track) => [track.id, track]),
  );
  const queue = snapshot.queue
    .filter((item) => trackMap.has(item.track_id))
    .map((item) => hydrateQueueItem(item, trackMap.get(item.track_id)!));
  if (!queue.length) {
    await setSetting(PLAYBACK_SESSION_SETTING_KEY, '');
    return false;
  }

  const previousCurrentItem = snapshot.queue[snapshot.current_index];
  const currentIndex = Math.max(
    0,
    previousCurrentItem
      ? queue.findIndex((item) => item.id === previousCurrentItem.id)
      : 0,
  );
  const currentItem = queue[currentIndex];
  const currentTrack = trackMap.get(currentItem.track_id);
  if (!currentTrack) return false;

  const generation = useQueueStore.getState().generation + 1;

  usePlaybackStore.setState({
    currentTrack,
    duration: (currentTrack.duration_ms ?? 0) / 1000,
    isPlaying: false,
    position: snapshot.position_seconds,
    repeat: snapshot.repeat,
    shuffle: snapshot.shuffle,
  });
  useQueueStore.setState({
    items: queue,
    currentIndex,
    source: snapshot.source ?? 'user',
    sourceDescriptor: snapshot.source_descriptor ?? { kind: 'custom' },
    originalOrder: snapshot.source_items,
    nextQueueSerial: snapshot.next_queue_serial,
    generation,
  });

  await setupPlayer();
  await Promise.all([
    syncRepeatMode(snapshot.repeat),
    setPlaybackShuffleEnabled(snapshot.shuffle),
  ]);
  await replacePlaybackQueue(
    queue.map((item) => trackToRntp(trackMap.get(item.track_id)!, item.id)),
    { autoplay: false, startIndex: currentIndex },
  );

  const position = clampSessionPosition(snapshot.position_seconds, currentTrack);
  if (position > 0) await seekPlayback(position);
  usePlaybackStore.setState({ position, isPlaying: false });
  lastSerializedSession = serializeCurrentSession(position);
  return true;
}

export function startMobilePlaybackSessionPersistence(): () => void {
  stopPersistence?.();
  let writeTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const flush = () => {
    writeChain = writeChain.then(async () => {
      const state = usePlaybackStore.getState();
      const position = state.currentTrack
        ? await getPlaybackPosition().catch(() => state.position)
        : 0;
      const serialized = serializeCurrentSession(position);
      if (serialized === lastSerializedSession) return;
      await setSetting(PLAYBACK_SESSION_SETTING_KEY, serialized);
      lastSerializedSession = serialized;
    }).catch(() => {});
  };

  const schedule = () => {
    if (stopped) return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      writeTimer = null;
      flush();
    }, SESSION_WRITE_DEBOUNCE_MS);
  };

  const unsubscribePlayback = usePlaybackStore.subscribe(schedule);
  const unsubscribeQueue = useQueueStore.subscribe(schedule);
  const interval = setInterval(() => {
    if (usePlaybackStore.getState().isPlaying) flush();
  }, POSITION_PERSIST_INTERVAL_MS);
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') flush();
  });
  schedule();

  const stop = () => {
    stopped = true;
    if (writeTimer) clearTimeout(writeTimer);
    clearInterval(interval);
    appStateSubscription.remove();
    unsubscribePlayback();
    unsubscribeQueue();
    flush();
    if (stopPersistence === stop) stopPersistence = null;
  };
  stopPersistence = stop;
  return stop;
}

function serializeCurrentSession(position: number): string {
  const playback = usePlaybackStore.getState();
  const queue = useQueueStore.getState();
  if (!playback.currentTrack || !queue.items.length || queue.currentIndex < 0) return '';

  const snapshot: PlaybackSessionSnapshot = {
    queue: queue.items.map(toPersistentQueueItem),
    source_items: queue.originalOrder.map(toPersistentQueueItem),
    next_queue_serial: queue.nextQueueSerial,
    current_index: Math.min(queue.currentIndex, queue.items.length - 1),
    position_seconds: Math.max(0, Math.round(position)),
    repeat: playback.repeat,
    shuffle: playback.shuffle,
    source: queue.source,
    source_descriptor: queue.sourceDescriptor,
  };
  return JSON.stringify(snapshot);
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

function hydrateQueueItem(item: QueueItem, track: Track): QueueItem {
  return {
    ...item,
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

function clampSessionPosition(position: number, track: Track): number {
  const duration = (track.duration_ms ?? 0) / 1000;
  if (duration <= 0) return Math.max(0, position);
  return Math.max(0, Math.min(position, Math.max(0, duration - 0.25)));
}
