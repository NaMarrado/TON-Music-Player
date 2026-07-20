import {
  createFollowingRollingQueueWindow,
  createRollingQueueWindow,
} from '@ton/core';
import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import { replacePlaybackQueue } from '../../playback-runtime';
import { buildRntpQueue, hydrateMobileQueueItems } from '../track-mapping';

export async function advanceRollingQueueWindow(): Promise<boolean> {
  const queue = useQueueStore.getState();
  const currentItem = queue.items[queue.currentIndex] ?? queue.items[queue.items.length - 1];
  if (!currentItem || !queue.originalOrder.length) return false;

  const window = createFollowingRollingQueueWindow(
    queue.originalOrder,
    currentItem,
    queue.generation,
    usePlaybackStore.getState().shuffle,
    queue.nextQueueSerial,
  );
  if (!window.items.length) return false;

  const hydratedItems = await hydrateMobileQueueItems(window.items);
  const tracks = await buildRntpQueue(hydratedItems, 0, queue.originalOrder.length);
  if (!tracks.length) return false;

  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: 0,
    nextQueueSerial: window.nextSerial,
  });
  await replacePlaybackQueue(tracks, { autoplay: true, startIndex: 0 });
  return true;
}

export async function retreatRollingQueueWindow(): Promise<boolean> {
  const queue = useQueueStore.getState();
  const currentItem = queue.items[queue.currentIndex] ?? queue.items[0];
  if (!currentItem || !queue.originalOrder.length) return false;

  const currentSourceIndex = currentItem.source_index ?? 0;
  const previousSourceIndex = (
    currentSourceIndex - 1 + queue.originalOrder.length
  ) % queue.originalOrder.length;
  const window = createRollingQueueWindow(
    queue.originalOrder,
    previousSourceIndex,
    queue.generation,
    usePlaybackStore.getState().shuffle,
  );
  const hydratedItems = await hydrateMobileQueueItems(window.items);
  const tracks = await buildRntpQueue(
    hydratedItems,
    window.currentIndex,
    queue.originalOrder.length,
  );
  if (!tracks.length) return false;

  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: window.currentIndex,
    nextQueueSerial: Math.max(queue.nextQueueSerial, window.nextSerial),
  });
  await replacePlaybackQueue(tracks, { autoplay: true, startIndex: window.currentIndex });
  return true;
}
