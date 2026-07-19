import {
  PLAYBACK_QUEUE_COMPACT_INDEX,
  compactAndRefillRollingQueue,
  type Track,
} from '@ton/core';
import { markTrackPlayed } from '../../stores/library-store';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import {
  muteHead,
  resumeContext,
  setLoudnessGain,
  unmuteHead,
} from '../engine';
import {
  getActiveElement,
  getPreloadElement,
  loadTrack,
  preloadTrack,
  swapElements,
} from '../media-element-pool';
import { getQueueItemTrackSnapshot } from './queue-helpers';
import { hydrateQueueItems } from './queue-helpers';
import {
  emitCurrentPosition,
  startPositionTracking,
  updateMediaSessionPosition,
} from './position';
import { safePlayElement } from './safe-play';
import { getPlaybackRuntimeState } from './state';

async function playActiveElement(): Promise<void> {
  await resumeContext();
  const element = getActiveElement();
  if (!element.src) {
    return;
  }

  const didPlay = await safePlayElement(element);
  if (!didPlay) {
    return;
  }

  usePlaybackStore.setState({ isPlaying: true });
  startPositionTracking();
  updateMediaSessionPosition();
}

function applyTrackLoudness(track: Track): void {
  const { loudnessNormEnabled } = usePlaybackStore.getState();
  if (loudnessNormEnabled && track.loudness_gain != null) {
    setLoudnessGain(track.loudness_gain);
  } else {
    setLoudnessGain(0);
  }
}

export async function startTrack(track: Track): Promise<void> {
  const runtimeState = getPlaybackRuntimeState();
  runtimeState.crossfadeTriggered = false;
  runtimeState.preloadedIndex = -1;

  muteHead();
  getActiveElement().pause();
  applyTrackLoudness(track);

  usePlaybackStore.setState({
    currentTrack: track,
    isPlaying: false,
    position: 0,
    duration: track.duration_ms ? track.duration_ms / 1000 : 0,
  });
  loadTrack(track.file_path);

  await playActiveElement();
  unmuteHead();

  window.api
    .invoke(
      'db:execute',
      'UPDATE tracks SET play_count = play_count + 1, last_played_at = ? WHERE id = ?',
      [Date.now(), track.id],
    )
    .catch(() => {});
  markTrackPlayed(track.id);
}

export async function restorePausedTrack(track: Track, position: number): Promise<void> {
  if (!track.file_path) return;

  const runtimeState = getPlaybackRuntimeState();
  runtimeState.crossfadeTriggered = false;
  runtimeState.preloadedIndex = -1;

  const element = getActiveElement();
  element.pause();
  applyTrackLoudness(track);
  usePlaybackStore.setState({
    currentTrack: track,
    isPlaying: false,
    position: Math.max(0, position),
    duration: track.duration_ms ? track.duration_ms / 1000 : 0,
  });
  loadTrack(track.file_path);
  await waitForMetadata(element);

  const duration = Number.isFinite(element.duration) && element.duration > 0
    ? element.duration
    : (track.duration_ms ?? 0) / 1000;
  const restoredPosition = duration > 0
    ? Math.max(0, Math.min(position, Math.max(0, duration - 0.25)))
    : Math.max(0, position);
  if (restoredPosition > 0) element.currentTime = restoredPosition;
  usePlaybackStore.setState({
    currentTrack: track,
    isPlaying: false,
    position: restoredPosition,
    duration,
  });
  emitCurrentPosition();
  updateMediaSessionPosition();
}

export async function loadQueueIndex(index: number): Promise<void> {
  const { items } = useQueueStore.getState();
  const item = items[index];
  if (!item) {
    return;
  }

  useQueueStore.setState({ currentIndex: index });

  const snapshotTrack = getQueueItemTrackSnapshot(item);
  const track = snapshotTrack ?? await loadTrackById(item.track_id);
  if (!track) {
    return;
  }

  const preloadElement = getPreloadElement();
  const expectedUrl = `ton-media://${encodeURIComponent(track.file_path)}`;
  if (preloadElement.src === expectedUrl && preloadElement.readyState >= 2) {
    muteHead();
    getActiveElement().pause();
    swapElements();
    applyTrackLoudness(track);

    usePlaybackStore.setState({
      currentTrack: track,
      isPlaying: false,
      position: 0,
      duration: track.duration_ms ? track.duration_ms / 1000 : 0,
    });

    await playActiveElement();
    unmuteHead();
    await compactQueueAfterNavigation(index);
    return;
  }

  await startTrack(track);
  await compactQueueAfterNavigation(index);
}

async function compactQueueAfterNavigation(index: number): Promise<void> {
  if (index < PLAYBACK_QUEUE_COMPACT_INDEX) return;
  const queue = useQueueStore.getState();
  if (queue.currentIndex !== index || !queue.originalOrder.length) return;
  const plan = compactAndRefillRollingQueue(
    queue.items,
    queue.originalOrder,
    index,
    queue.generation,
    usePlaybackStore.getState().shuffle,
    queue.nextQueueSerial,
  );
  const hydratedItems = await hydrateQueueItems(plan.items);
  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: plan.currentIndex,
    nextQueueSerial: plan.nextSerial,
  });
}

export async function preloadNextTrack(index: number): Promise<void> {
  const runtimeState = getPlaybackRuntimeState();
  if (runtimeState.preloadedIndex === index) {
    return;
  }

  runtimeState.preloadedIndex = index;
  const { items } = useQueueStore.getState();
  const item = items[index];
  if (!item) {
    return;
  }

  if (item.file_path) {
    preloadTrack(item.file_path);
    return;
  }

  const track = await loadTrackById(item.track_id);
  if (track?.file_path) {
    preloadTrack(track.file_path);
  }
}

async function loadTrackById(trackId: number): Promise<Track | null> {
  return await window.api.invoke('library:get-track-snapshot', trackId) as Track | null;
}

function waitForMetadata(element: HTMLAudioElement): Promise<void> {
  if (element.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      element.removeEventListener('loadedmetadata', finish);
      element.removeEventListener('error', finish);
      resolve();
    };
    const timeout = window.setTimeout(finish, 3_000);
    element.addEventListener('loadedmetadata', finish, { once: true });
    element.addEventListener('error', finish, { once: true });
  });
}
