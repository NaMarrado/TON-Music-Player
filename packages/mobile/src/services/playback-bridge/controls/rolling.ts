import {
  PLAYBACK_QUEUE_HISTORY_SIZE,
  PLAYBACK_QUEUE_WINDOW_SIZE,
  compactAndRefillBoundedRollingQueue,
  createFollowingRollingQueueWindow,
  createRollingQueueWindow,
  type QueueItem,
} from '@ton/core';
import { usePlaybackStore } from '../../../stores/playback-store';
import { useQueueStore } from '../../../stores/queue-store';
import {
  addPlaybackTracks,
  removePlaybackTracks,
  replacePlaybackQueue,
} from '../../playback-runtime';
import { buildRntpQueue, hydrateMobileQueueItems } from '../track-mapping';

let rollingMutationChain: Promise<unknown> = Promise.resolve();

function runRollingMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = rollingMutationChain.then(operation, operation);
  rollingMutationChain = result.then(() => undefined, () => undefined);
  return result;
}

export function ensureRollingQueueBuffer(): Promise<boolean> {
  return runRollingMutation(ensureRollingQueueBufferNow);
}

async function ensureRollingQueueBufferNow(): Promise<boolean> {
  const queue = useQueueStore.getState();
  if (
    !queue.originalOrder.length
    || !queue.items.length
    || queue.currentIndex < 0
    || queue.currentIndex >= queue.items.length
  ) {
    return false;
  }

  const plan = compactAndRefillBoundedRollingQueue(
    queue.items,
    queue.originalOrder,
    queue.currentIndex,
    queue.generation,
    usePlaybackStore.getState().shuffle,
    queue.nextQueueSerial,
  );
  if (!plan.removedItems.length && !plan.addedItems.length) {
    return false;
  }

  const hydratedItems = await hydrateMobileQueueItems(plan.addedItems);
  const tracks = await buildRntpQueue(
    hydratedItems,
    plan.items.length - plan.addedItems.length,
    queue.originalOrder.length,
  );
  if (tracks.length !== hydratedItems.length) return false;
  const beforeMutation = useQueueStore.getState();
  if (
    beforeMutation.generation !== queue.generation
    || beforeMutation.items[beforeMutation.currentIndex]?.id
      !== queue.items[queue.currentIndex]?.id
  ) {
    return false;
  }

  // Append first so playback always has upcoming audio while the completed
  // prefix is compacted out of the native queue.
  if (tracks.length) await addPlaybackTracks(tracks);
  if (plan.removedItems.length > 0) {
    await removePlaybackTracks(
      Array.from({ length: plan.removedItems.length }, (_, index) => index),
    );
  }

  const latest = useQueueStore.getState();
  if (latest.generation !== queue.generation) return false;
  const nextCurrentIndex = Math.max(0, latest.currentIndex - plan.removedItems.length);
  const retainedItems = plan.items.slice(0, plan.items.length - plan.addedItems.length);
  useQueueStore.setState({
    items: [...retainedItems, ...hydratedItems],
    currentIndex: nextCurrentIndex,
    previousWindows: plan.removedItems.length > 0
      ? appendRollingQueueHistory(queue.previousWindows, plan.removedItems)
      : queue.previousWindows,
    nextQueueSerial: plan.nextSerial,
  });
  return true;
}

export async function advanceRollingQueueWindow(
  autoplay = usePlaybackStore.getState().isPlaying,
): Promise<boolean> {
  return runRollingMutation(() => advanceRollingQueueWindowNow(autoplay));
}

async function advanceRollingQueueWindowNow(autoplay: boolean): Promise<boolean> {
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
    previousWindows: appendRollingQueueHistory(
      queue.previousWindows,
      queue.items.slice(0, queue.currentIndex + 1),
    ),
    nextWindows: restoredWindow ? queue.nextWindows.slice(1) : [],
    nextQueueSerial: generatedWindow?.nextSerial ?? queue.nextQueueSerial,
  });
  await replacePlaybackQueue(tracks, { autoplay, startIndex: 0 });
  return true;
}

export async function retreatRollingQueueWindow(
  autoplay = usePlaybackStore.getState().isPlaying,
): Promise<boolean> {
  return runRollingMutation(() => retreatRollingQueueWindowNow(autoplay));
}

async function retreatRollingQueueWindowNow(autoplay: boolean): Promise<boolean> {
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

export function appendRollingQueueHistory(
  windows: QueueItem[][],
  items: QueueItem[],
): QueueItem[][] {
  return chunkQueueItems(
    [...windows.flat(), ...items].slice(-PLAYBACK_QUEUE_HISTORY_SIZE),
  );
}

function prependFutureWindow(windows: QueueItem[][], items: QueueItem[]): QueueItem[][] {
  return chunkQueueItems(
    [...items, ...windows.flat()].slice(0, PLAYBACK_QUEUE_HISTORY_SIZE),
  );
}

function chunkQueueItems(items: QueueItem[]): QueueItem[][] {
  const windows: QueueItem[][] = [];
  for (let index = 0; index < items.length; index += PLAYBACK_QUEUE_WINDOW_SIZE) {
    windows.push(items.slice(index, index + PLAYBACK_QUEUE_WINDOW_SIZE));
  }
  return windows;
}
