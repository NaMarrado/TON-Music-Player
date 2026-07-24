import { create } from 'zustand';
import type {
  PlaybackQueueSourceDescriptor,
  QueueItem,
  QueueSource,
} from '@ton/core';

interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  source: QueueSource | null;
  sourceDescriptor: PlaybackQueueSourceDescriptor | null;
  originalOrder: QueueItem[];
  previousWindows: QueueItem[][];
  nextWindows: QueueItem[][];
  nextQueueSerial: number;
  generation: number;
}

export const useQueueStore = create<QueueState>()(() => ({
  items: [],
  currentIndex: -1,
  source: null,
  sourceDescriptor: null,
  originalOrder: [],
  previousWindows: [],
  nextWindows: [],
  nextQueueSerial: 0,
  generation: 0,
}));
