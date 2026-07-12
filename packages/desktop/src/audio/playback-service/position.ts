import { getActiveElement } from '../media-element-pool';
import { usePlaybackStore } from '../../stores/playback-store';
import { getPlaybackRuntimeState, type PositionListener } from './state';

export function subscribePosition(fn: PositionListener): () => void {
  const state = getPlaybackRuntimeState();
  state.positionListeners.add(fn);
  return () => {
    state.positionListeners.delete(fn);
  };
}

export function startPositionTracking(): void {
  stopPositionTracking();

  let lastStoreUpdate = 0;
  const tick = () => {
    const element = getActiveElement();
    const position = element.currentTime;
    const duration = element.duration && isFinite(element.duration)
      ? element.duration
      : usePlaybackStore.getState().duration;

    emitPosition(position, duration);

    const now = performance.now();
    if (now - lastStoreUpdate > 250) {
      usePlaybackStore.setState({ position });
      lastStoreUpdate = now;
    }

    getPlaybackRuntimeState().rafId = requestAnimationFrame(tick);
  };

  getPlaybackRuntimeState().rafId = requestAnimationFrame(tick);
}

export function stopPositionTracking(): void {
  const state = getPlaybackRuntimeState();
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

export function updateMediaSessionPosition(): void {
  if (!('mediaSession' in navigator)) {
    return;
  }

  const { position, duration } = usePlaybackStore.getState();
  if (!duration) {
    return;
  }

  navigator.mediaSession.setPositionState({
    duration,
    playbackRate: 1,
    position: Math.min(position, duration),
  });
}

export function emitCurrentPosition(): void {
  const element = getActiveElement();
  const position = element.currentTime;
  const duration = element.duration && isFinite(element.duration)
    ? element.duration
    : usePlaybackStore.getState().duration;

  emitPosition(position, duration);
}

function emitPosition(position: number, duration: number): void {
  for (const listener of getPlaybackRuntimeState().positionListeners) {
    listener(position, duration);
  }
}
