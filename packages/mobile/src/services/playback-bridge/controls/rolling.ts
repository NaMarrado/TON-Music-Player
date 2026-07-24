import {
  createFollowingRollingQueueWindow,
  createRollingQueueWindow,
  type QueueItem,
} from '@ton/core';
import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import { replacePlaybackQueue } from '../../playback-runtime';
import { buildRntpQueue, hydrateMobileQueueItems } from '../track-mapping';

const PLAYBACK_QUEUE_HISTORY_WINDOW_LIMIT = 10;

export async function advanceRollingQueueWindow(
  autoplay = usePlaybackStore.getState().isPlaying,
): Promise<boolean> {
  const queue = useQueueStore.getState();
  const currentItem = queue.items[queue.currentIndex] ?? queue.items[queue.items.length - 1];
  if (!currentItem || !queue.originalOrder.length) return false;

  const restoredWindow = queue.nextWindows[0];
  const generatedWindow = restoredWindow
    ? null
    : createFollowingRollingQueueWindow(
      queue.originalOrder,
      currentItem,
      queue.generation,
      usePlaybackStore.getState().shuffle,
      queue.nextQueueSerial,
    );
  const nextItems = restoredWindow ?? generatedWindow?.items ?? [];
  if (!nextItems.length) return false;

  const hydratedItems = await hydrateMobileQueueItems(nextItems);
  const tracks = await buildRntpQueue(hydratedItems, 0, queue.originalOrder.length);
  if (!tracks.length) return false;

  useQueueStore.setState({
    items: hydratedItems,
    currentIndex: 0,
    previousWindows: appendHistoryWindow(queue.previousWindows, queue.items),
    nextWindows: restoredWindow ? queue.nextWindows.slice(1) : [],
    nextQueueSerial: generatedWindow?.nextSerial ?? queue.nextQueueSerial,
  });
  await replacePlaybackQueue(tracks, { autoplay, startIndex: 0 });
  return true;
}

export async function retreatRollingQueueWindow(
  autoplay = usePlaybackStore.getState().isPlaying,
): Promise<boolean> {
  const queue = useQueueStore.getState();
  const currentItem = queue.items[queue.currentIndex] ?? queue.items[0];
  if (!currentItem || !queue.originalOrder.length) return false;

  const previousWindow = queue.previousWindows[queue.previousWindows.length - 1];
  if (previousWindow?.length) {
    const hydratedItems = await hydrateMobileQueueItems(previousWindow);
    const startIndex = hydratedItems.length - 1;
    const tracks = await buildRntpQueue(
      hydratedItems,
      startIndex,
      queue.originalOrder.length,
    );
    if (!tracks.length) return false;

    useQueueStore.setState({
      items: hydratedItems,
      currentIndex: startIndex,
      previousWindows: queue.previousWindows.slice(0, -1),
      nextWindows: prependFutureWindow(queue.nextWindows, queue.items),
    });
    await replacePlaybackQueue(tracks, { autoplay, startIndex });
    return true;
  }

  if (usePlaybackStore.getState().shuffle) {
    return false;
  }

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
  await replacePlaybackQueue(tracks, { autoplay, startIndex: window.currentIndex });
  return true;
}

function appendHistoryWindow(windows: QueueItem[][], items: QueueItem[]): QueueItem[][] {
  return [...windows, items]
    .filter((window) => window.length > 0)
    .slice(-PLAYBACK_QUEUE_HISTORY_WINDOW_LIMIT);
}

function prependFutureWindow(windows: QueueItem[][], items: QueueItem[]): QueueItem[][] {
  return [items, ...windows]
    .filter((window) => window.length > 0)
    .slice(0, PLAYBACK_QUEUE_HISTORY_WINDOW_LIMIT);
}
