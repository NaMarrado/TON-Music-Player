import {
  clampVolumePercent,
  type Track,
} from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import {
  initAudioEngine,
  resumeContext,
  setVolume as engineSetVolume,
  setVolumeImmediate as engineSetVolumeImmediate,
} from '../engine';
import {
  getActiveElement,
  initMediaPool,
} from '../media-element-pool';
import {
  restoreAudioSettings,
  setEqBand,
  setEqPreset,
  setFrequency,
  toggleEq,
  toggleFrequencyTuning,
  toggleLoudnessNorm,
} from '../playback-eq';
import { setupAudioEvents } from './events';
import {
  emitCurrentPosition,
  startPositionTracking,
  stopPositionTracking,
  subscribePosition,
  updateMediaSessionPosition,
} from './position';
import {
  nextTrack,
  prevTrack,
} from './queue-controls';
import {
  buildQueueItems,
  shuffleArray,
} from './queue-helpers';
import { safePlayElement } from './safe-play';
import { preloadNextTrack, loadQueueIndex, startTrack } from './track-loading';
import { getPlaybackRuntimeState } from './state';
import {
  persistVolumePercent,
  readPersistedVolumePercent,
} from './volume-settings';
import {
  logVolumeDebug,
  logVolumePreview,
} from './volume-debug';

export {
  setEqBand,
  setEqPreset,
  setFrequency,
  subscribePosition,
  toggleEq,
  toggleFrequencyTuning,
  toggleLoudnessNorm,
};
export {
  jumpToQueueIndex,
  nextTrack,
  prevTrack,
  toggleRepeat,
  toggleShuffle,
} from './queue-controls';

let volumeHydrationPromise: Promise<number> | null = null;

async function hydrateVolumePercent(): Promise<number> {
  if (!volumeHydrationPromise) {
    volumeHydrationPromise = readPersistedVolumePercent().then((volumePercent) => {
      usePlaybackStore.setState({ volumePercent });
      return volumePercent;
    });
  }

  return volumeHydrationPromise;
}

export function primePlaybackState(): void {
  void hydrateVolumePercent();
}

export async function initPlayback(): Promise<void> {
  const runtimeState = getPlaybackRuntimeState();
  if (runtimeState.initialized) {
    return;
  }

  await initAudioEngine();
  initMediaPool();
  setupAudioEvents({
    preloadNextTrack,
    loadQueueIndex,
    nextTrack,
    updateMediaSessionPosition,
  });

  const volumePercent = await hydrateVolumePercent();
  const { isMuted } = usePlaybackStore.getState();
  if (isMuted) {
    engineSetVolumeImmediate(0);
  } else {
    engineSetVolume(volumePercent);
  }
  logVolumeDebug('init:apply', { volumePercent, isMuted });
  restoreAudioSettings();
  runtimeState.initialized = true;

  window.api.on('tray:play-pause', () => {
    void toggle();
  });
  window.api.on('tray:next', () => {
    void nextTrack();
  });
  window.api.on('tray:prev', () => {
    void prevTrack();
  });
  window.api.on('menu:settings', () => {
    window.location.hash = '#/settings';
  });
}

export async function playTracks(tracks: Track[], startIndex: number): Promise<void> {
  await initPlayback();
  const items = buildQueueItems(tracks);
  const { shuffle } = usePlaybackStore.getState();
  const hasStartTrack = startIndex >= 0 && startIndex < items.length;
  const currentItem = hasStartTrack ? items[startIndex] : null;
  const rest = items.filter((_, index) => index !== startIndex);

  if (shuffle && currentItem && rest.length > 0) {
    shuffleArray(rest);
    const shuffledItems = [currentItem, ...rest];

    useQueueStore.setState({
      items: shuffledItems,
      currentIndex: 0,
      source: 'user',
      originalOrder: [...items],
    });

    await startTrack(tracks[startIndex]);
    return;
  }

  useQueueStore.setState({
    items,
    currentIndex: startIndex,
    source: 'user',
    originalOrder: [...items],
  });

  const track = tracks[startIndex];
  if (track) {
    await startTrack(track);
  }
}

export async function playSingleTrack(track: Track): Promise<void> {
  await playTracks([track], 0);
}

export async function play(): Promise<void> {
  await initPlayback();
  await resumeContext();

  const element = getActiveElement();
  if (element.src) {
    const didPlay = await safePlayElement(element);
    if (didPlay) {
      usePlaybackStore.setState({ isPlaying: true });
      startPositionTracking();
      updateMediaSessionPosition();
    }
  }
}

export function pause(): void {
  getActiveElement().pause();
  usePlaybackStore.setState({ isPlaying: false });
  stopPositionTracking();
  updateMediaSessionPosition();
}

export async function toggle(): Promise<void> {
  const { isPlaying } = usePlaybackStore.getState();
  if (isPlaying) {
    pause();
  } else {
    await play();
  }
}

export function seek(seconds: number): void {
  const element = getActiveElement();
  const duration = element.duration && isFinite(element.duration)
    ? element.duration
    : usePlaybackStore.getState().duration;

  if (duration <= 0) {
    return;
  }

  element.currentTime = Math.max(0, Math.min(seconds, duration));
  usePlaybackStore.setState({ position: element.currentTime });
  emitCurrentPosition();
  updateMediaSessionPosition();
}

export function previewVolume(value: number): void {
  const clamped = clampVolumePercent(value);
  usePlaybackStore.setState({ volumePercent: clamped, isMuted: false });
  engineSetVolume(clamped);
  logVolumePreview(clamped);
}

export function setVolume(value: number): void {
  previewVolume(value);
  const { volumePercent } = usePlaybackStore.getState();
  logVolumeDebug('commit', { volumePercent });
  persistVolumePercent(volumePercent);
}

export function toggleMute(): void {
  const { isMuted, volumePercent } = usePlaybackStore.getState();
  if (isMuted) {
    usePlaybackStore.setState({ isMuted: false });
    engineSetVolume(volumePercent);
    logVolumeDebug('mute:off', { volumePercent });
  } else {
    usePlaybackStore.setState({ isMuted: true });
    engineSetVolumeImmediate(0);
    logVolumeDebug('mute:on', { volumePercent });
  }
}
