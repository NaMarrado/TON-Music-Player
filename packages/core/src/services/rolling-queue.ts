import type { QueueItem } from '../types/queue';

export const PLAYBACK_QUEUE_WINDOW_SIZE = 20;
export const PLAYBACK_QUEUE_COMPACT_INDEX = 10;

export interface RollingQueueWindow {
  items: QueueItem[];
  currentIndex: number;
  nextSerial: number;
}

export function createRollingQueueWindow(
  sourceItems: QueueItem[],
  startSourceIndex: number,
  generation: number,
  shuffle: boolean,
  random: () => number = Math.random,
): RollingQueueWindow {
  if (!sourceItems.length || startSourceIndex < 0 || startSourceIndex >= sourceItems.length) {
    throw new Error('invalid-playback-queue-source');
  }

  const targetSize = Math.min(PLAYBACK_QUEUE_WINDOW_SIZE, sourceItems.length);
  const items: QueueItem[] = [];
  let nextSerial = 0;
  let sourceIndex = startSourceIndex;

  while (items.length < targetSize) {
    items.push(materializeQueueItem(sourceItems[sourceIndex], sourceIndex, generation, nextSerial));
    nextSerial += 1;
    sourceIndex = shuffle
      ? randomSourceIndex(sourceItems.length, random)
      : (sourceIndex + 1) % sourceItems.length;
  }

  return { items, currentIndex: 0, nextSerial };
}

export function createFollowingRollingQueueWindow(
  sourceItems: QueueItem[],
  currentItem: QueueItem,
  generation: number,
  shuffle: boolean,
  nextSerial: number,
  random: () => number = Math.random,
): RollingQueueWindow {
  if (!sourceItems.length) {
    return { items: [], currentIndex: -1, nextSerial };
  }

  const currentSourceIndex = currentItem.source_index ?? 0;
  let sourceIndex = shuffle
    ? randomSourceIndex(sourceItems.length, random)
    : (currentSourceIndex + 1) % sourceItems.length;
  const targetSize = Math.min(PLAYBACK_QUEUE_WINDOW_SIZE, sourceItems.length);
  const items: QueueItem[] = [];

  while (items.length < targetSize) {
    items.push(materializeQueueItem(
      sourceItems[sourceIndex],
      sourceIndex,
      generation,
      nextSerial,
    ));
    nextSerial += 1;
    sourceIndex = shuffle
      ? randomSourceIndex(sourceItems.length, random)
      : (sourceIndex + 1) % sourceItems.length;
  }

  return { items, currentIndex: 0, nextSerial };
}

export function compactAndRefillRollingQueue(
  items: QueueItem[],
  sourceItems: QueueItem[],
  currentIndex: number,
  generation: number,
  shuffle: boolean,
  nextSerial: number,
  random: () => number = Math.random,
): RollingQueueWindow {
  if (!items.length || !sourceItems.length || currentIndex < 0 || currentIndex >= items.length) {
    return { items: [], currentIndex: -1, nextSerial };
  }

  const trimCount = Math.max(0, currentIndex - 1);
  const retained = items.slice(trimCount);
  const nextCurrentIndex = currentIndex - trimCount;
  const targetSize = Math.min(PLAYBACK_QUEUE_WINDOW_SIZE, sourceItems.length);
  let sourceIndex = resolveNextSourceIndex(retained, sourceItems.length, shuffle, random);

  while (retained.length < targetSize) {
    retained.push(materializeQueueItem(
      sourceItems[sourceIndex],
      sourceIndex,
      generation,
      nextSerial,
    ));
    nextSerial += 1;
    sourceIndex = shuffle
      ? randomSourceIndex(sourceItems.length, random)
      : (sourceIndex + 1) % sourceItems.length;
  }

  return { items: retained, currentIndex: nextCurrentIndex, nextSerial };
}

export function rebuildRollingQueueUpcoming(
  items: QueueItem[],
  sourceItems: QueueItem[],
  currentIndex: number,
  generation: number,
  shuffle: boolean,
  nextSerial: number,
  random: () => number = Math.random,
): RollingQueueWindow {
  if (!items.length || !sourceItems.length || currentIndex < 0 || currentIndex >= items.length) {
    return { items: [], currentIndex: -1, nextSerial };
  }

  const retained = items.slice(0, currentIndex + 1);
  const targetSize = Math.min(PLAYBACK_QUEUE_WINDOW_SIZE, sourceItems.length);
  let sourceIndex = shuffle
    ? randomSourceIndex(sourceItems.length, random)
    : ((retained[retained.length - 1]?.source_index ?? 0) + 1) % sourceItems.length;

  while (retained.length < targetSize) {
    retained.push(materializeQueueItem(
      sourceItems[sourceIndex],
      sourceIndex,
      generation,
      nextSerial,
    ));
    nextSerial += 1;
    sourceIndex = shuffle
      ? randomSourceIndex(sourceItems.length, random)
      : (sourceIndex + 1) % sourceItems.length;
  }

  return { items: retained, currentIndex, nextSerial };
}

function resolveNextSourceIndex(
  retained: QueueItem[],
  sourceCount: number,
  shuffle: boolean,
  random: () => number,
): number {
  if (shuffle) return randomSourceIndex(sourceCount, random);
  const lastSourceIndex = retained[retained.length - 1]?.source_index ?? -1;
  return (lastSourceIndex + 1 + sourceCount) % sourceCount;
}

function materializeQueueItem(
  source: QueueItem,
  sourceIndex: number,
  generation: number,
  serial: number,
): QueueItem {
  return {
    ...source,
    id: `${source.track_id}-g${generation}-q${serial}`,
    source_index: sourceIndex,
  };
}

function randomSourceIndex(sourceCount: number, random: () => number): number {
  return Math.min(sourceCount - 1, Math.floor(random() * sourceCount));
}
