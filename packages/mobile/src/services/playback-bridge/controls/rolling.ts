import { createFollowingRollingQueueWindow } from '@ton/core';
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
  const tracks = await buildRntpQueue(hydratedItems);
  if (!tracks.length) return false;

  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: 0,
    nextQueueSerial: window.nextSerial,
  });
  await replacePlaybackQueue(tracks, { autoplay: true, startIndex: 0 });
  return true;
}
