import { GAPLESS_CROSSFADE_MS, GAPLESS_PRELOAD_MS } from '@ton/core';
import { getActiveElement, getPreloadElement } from '../media-element-pool';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getPlaybackRuntimeState } from './state';

type AudioEventDependencies = {
  preloadNextTrack: (index: number) => Promise<void>;
  loadQueueIndex: (index: number) => Promise<void>;
  nextTrack: (auto?: boolean) => Promise<void>;
  updateMediaSessionPosition: () => void;
};

export function setupAudioEvents(deps: AudioEventDependencies): void {
  const activeElement = getActiveElement();
  const preloadElement = getPreloadElement();

  for (const element of [activeElement, preloadElement]) {
    element.addEventListener('loadedmetadata', (event) => {
      handleMetadata(event, deps.updateMediaSessionPosition);
    });
    element.addEventListener('ended', () => {
      void handleEnded(deps.nextTrack);
    });
    element.addEventListener('timeupdate', () => {
      void handleTimeUpdate(deps);
    });
  }
}

function handleMetadata(
  event: Event,
  updateMediaSessionPosition: () => void,
): void {
  const target = event.target as HTMLAudioElement;
  if (target === getActiveElement() && target.duration && isFinite(target.duration)) {
    usePlaybackStore.setState({ duration: target.duration });
    updateMediaSessionPosition();
  }
}

async function handleEnded(nextTrack: (auto?: boolean) => Promise<void>): Promise<void> {
  const state = getPlaybackRuntimeState();
  if (state.crossfadeTriggered) {
    state.crossfadeTriggered = false;
    return;
  }

  await nextTrack(true);
}

async function handleTimeUpdate(deps: AudioEventDependencies): Promise<void> {
  const state = getPlaybackRuntimeState();
  const element = getActiveElement();
  const { items, currentIndex } = useQueueStore.getState();
  const remaining = element.duration ? element.duration - element.currentTime : Infinity;

  if (remaining < GAPLESS_PRELOAD_MS / 1000) {
    const nextIndex = currentIndex + 1;
    if (nextIndex < items.length) {
      await deps.preloadNextTrack(nextIndex);
    }
  }

  if (!state.crossfadeTriggered && remaining < GAPLESS_CROSSFADE_MS / 1000 && remaining > 0) {
    const preloadElement = getPreloadElement();
    if (preloadElement.src && preloadElement.readyState >= 2) {
      state.crossfadeTriggered = true;
      const { repeat } = usePlaybackStore.getState();
      let nextIndex: number | null = null;

      if (repeat === 'one') {
        nextIndex = currentIndex;
      } else if (currentIndex < items.length - 1) {
        nextIndex = currentIndex + 1;
      } else if (repeat === 'all') {
        nextIndex = 0;
      }

      if (nextIndex !== null) {
        await deps.loadQueueIndex(nextIndex);
      }
    }
  }
}
