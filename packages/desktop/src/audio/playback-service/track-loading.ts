import type { Track } from '@ton/core';
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
import {
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
      position: 0,
      duration: track.duration_ms ? track.duration_ms / 1000 : 0,
    });

    await playActiveElement();
    unmuteHead();
    return;
  }

  await startTrack(track);
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
