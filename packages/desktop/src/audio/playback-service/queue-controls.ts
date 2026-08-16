import {
  compactAndRefillRollingQueue,
  rebuildRollingQueueUpcoming,
} from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getActiveElement } from '../media-element-pool';
import { updateMediaSessionPosition } from './position';
import { loadQueueIndex } from './track-loading';
import { hydrateQueueItems } from './queue-helpers';

export async function nextTrack(auto = false): Promise<void> {
  const initialQueue = useQueueStore.getState();
  const { repeat } = usePlaybackStore.getState();

  if (initialQueue.items.length === 0) {
    return;
  }

  if (auto && repeat === 'one') {
    await loadQueueIndex(initialQueue.currentIndex);
    return;
  }

  const attemptLimit = Math.max(
    1,
    initialQueue.originalOrder.length || initialQueue.items.length,
  );
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const nextIndex = await prepareNextQueueIndex();
    if (nextIndex == null) return;
    try {
      if (await loadQueueIndex(nextIndex)) return;
    } catch (error) {
      console.warn('[Playback] Skipping unavailable queue track:', error);
    }
  }
  usePlaybackStore.setState({ isPlaying: false });
}

async function prepareNextQueueIndex(): Promise<number | null> {
  const queue = useQueueStore.getState();
  if (queue.currentIndex < queue.items.length - 1) {
    return queue.currentIndex + 1;
  }

  const window = compactAndRefillRollingQueue(
    queue.items,
    queue.originalOrder,
    queue.currentIndex,
    queue.generation,
    usePlaybackStore.getState().shuffle,
    queue.nextQueueSerial,
  );
  const nextIndex = window.currentIndex + 1;
  if (!window.items[nextIndex]) return null;
  const hydratedItems = await hydrateQueueItems(window.items);
  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: window.currentIndex,
    nextQueueSerial: window.nextSerial,
  });
  return nextIndex;
}

export async function prevTrack(): Promise<void> {
  const element = getActiveElement();
  if (element.currentTime > 3) {
    element.currentTime = 0;
    usePlaybackStore.setState({ position: 0 });
    updateMediaSessionPosition();
    return;
  }

  const { items, currentIndex } = useQueueStore.getState();
  if (items.length === 0) {
    return;
  }

  if (currentIndex > 0) {
    await loadQueueIndex(currentIndex - 1);
    return;
  }

  getActiveElement().currentTime = 0;
  usePlaybackStore.setState({ position: 0 });
  updateMediaSessionPosition();
}

export async function toggleShuffle(): Promise<void> {
  const { shuffle } = usePlaybackStore.getState();
  const queue = useQueueStore.getState();

  const nextShuffle = !shuffle;
  const plan = rebuildRollingQueueUpcoming(
    queue.items,
    queue.originalOrder,
    queue.currentIndex,
    queue.generation,
    nextShuffle,
    queue.nextQueueSerial,
  );

  const hydratedItems = await hydrateQueueItems(plan.items);
  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: plan.currentIndex,
    nextQueueSerial: plan.nextSerial,
  });
  usePlaybackStore.setState({ shuffle: nextShuffle });
}

export function toggleRepeat(): void {
  const { repeat } = usePlaybackStore.getState();
  usePlaybackStore.setState({ repeat: repeat === 'all' ? 'one' : 'all' });
}

export async function jumpToQueueIndex(index: number): Promise<void> {
  await loadQueueIndex(index);
}
