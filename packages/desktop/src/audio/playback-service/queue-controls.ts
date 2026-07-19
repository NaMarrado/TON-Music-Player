import {
  createFollowingRollingQueueWindow,
  rebuildRollingQueueUpcoming,
} from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getActiveElement } from '../media-element-pool';
import { updateMediaSessionPosition } from './position';
import { loadQueueIndex } from './track-loading';
import { hydrateQueueItems } from './queue-helpers';

export async function nextTrack(auto = false): Promise<void> {
  const { items, currentIndex } = useQueueStore.getState();
  const { repeat, shuffle } = usePlaybackStore.getState();

  if (items.length === 0) {
    return;
  }

  if (auto && repeat === 'one') {
    await loadQueueIndex(currentIndex);
    return;
  }

  let nextIndex: number;
  if (currentIndex < items.length - 1) {
    nextIndex = currentIndex + 1;
  } else {
    const queue = useQueueStore.getState();
    const window = createFollowingRollingQueueWindow(
      queue.originalOrder,
      items[currentIndex],
      queue.generation,
      shuffle,
      queue.nextQueueSerial,
    );
    if (!window.items.length) return;
    const hydratedItems = await hydrateQueueItems(window.items);
    useQueueStore.setState({
      items: hydratedItems,
      currentIndex: 0,
      nextQueueSerial: window.nextSerial,
    });
    await loadQueueIndex(0);
    return;
  }

  await loadQueueIndex(nextIndex);
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

  const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
  await loadQueueIndex(prevIndex);
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
