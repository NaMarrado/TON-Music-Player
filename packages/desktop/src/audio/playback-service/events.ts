import { GAPLESS_CROSSFADE_MS, GAPLESS_PRELOAD_MS } from '@ton/core';
import { getActiveElement, getPreloadElement } from '../media-element-pool';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getPlaybackRuntimeState } from './state';

type AudioEventDependencies = {
  preloadNextTrack: (index: number) => Promise<void>;
  loadQueueIndex: (index: number) => Promise<boolean>;
  nextTrack: (auto?: boolean) => Promise<void>;
  updateMediaSessionPosition: () => void;
};

let terminalAdvancePromise: Promise<void> | null = null;

export function setupAudioEvents(deps: AudioEventDependencies): void {
  const activeElement = getActiveElement();
  const preloadElement = getPreloadElement();

  for (const element of [activeElement, preloadElement]) {
    element.addEventListener('loadedmetadata', (event) => {
      handleMetadata(event, deps.updateMediaSessionPosition);
    });
    element.addEventListener('ended', (event) => {
      void handleEnded(event, deps.nextTrack);
    });
    element.addEventListener('error', (event) => {
      void handlePlaybackError(event, deps.nextTrack);
    });
    element.addEventListener('timeupdate', (event) => {
      void handleTimeUpdate(event, deps);
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

async function handleEnded(
  event: Event,
  nextTrack: (auto?: boolean) => Promise<void>,
): Promise<void> {
  const state = getPlaybackRuntimeState();
  if (event.target !== getActiveElement()) {
    if (state.crossfadeTriggered) state.crossfadeTriggered = false;
    return;
  }
  if (state.crossfadeTriggered) {
    state.crossfadeTriggered = false;
    return;
  }

  await advanceAfterTerminalEvent(nextTrack);
}

async function handlePlaybackError(
  event: Event,
  nextTrack: (auto?: boolean) => Promise<void>,
): Promise<void> {
  const target = event.target as HTMLAudioElement;
  if (target !== getActiveElement()) return;

  const mediaError = target.error;
  console.warn('[Playback] Active media failed; advancing queue.', {
    code: mediaError?.code ?? null,
    message: mediaError?.message ?? null,
  });
  getPlaybackRuntimeState().crossfadeTriggered = false;
  usePlaybackStore.setState({ isPlaying: false });
  await advanceAfterTerminalEvent(nextTrack);
}

async function advanceAfterTerminalEvent(
  nextTrack: (auto?: boolean) => Promise<void>,
): Promise<void> {
  if (terminalAdvancePromise) return terminalAdvancePromise;
  terminalAdvancePromise = nextTrack(true).finally(() => {
    terminalAdvancePromise = null;
  });
  return terminalAdvancePromise;
}

async function handleTimeUpdate(
  event: Event,
  deps: AudioEventDependencies,
): Promise<void> {
  if (event.target !== getActiveElement()) return;
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
        let loaded = false;
        try {
          loaded = await deps.loadQueueIndex(nextIndex);
        } catch (error) {
          console.warn('[Playback] Gapless transition failed; advancing queue.', error);
        } finally {
          // The previous element is paused before its natural end during a
          // successful A/B swap, so its `ended` event cannot be responsible
          // for releasing this transition guard.
          state.crossfadeTriggered = false;
        }
        if (!loaded) {
          await advanceAfterTerminalEvent(deps.nextTrack);
        }
      }
    }
  }
}
