import { create } from 'zustand';
import type { QueueItem, QueueSource } from '@ton/core';

interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  source: QueueSource | null;
  originalOrder: QueueItem[];
  nextQueueSerial: number;
  generation: number;
}

export const useQueueStore = create<QueueState>()(() => ({
  items: [],
  currentIndex: -1,
  source: null,
  originalOrder: [],
  nextQueueSerial: 0,
  generation: 0,
}));
