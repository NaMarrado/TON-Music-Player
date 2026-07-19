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
  nextQueueSerial: number;
  generation: number;
}

export const useQueueStore = create<QueueState>()(() => ({
  items: [],
  currentIndex: -1,
  source: null,
  sourceDescriptor: null,
  originalOrder: [],
  nextQueueSerial: 0,
  generation: 0,
}));
