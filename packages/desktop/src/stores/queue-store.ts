import { create } from 'zustand';
import type { QueueItem, QueueSource } from '@ton/core';

interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  source: QueueSource | null;
  originalOrder: QueueItem[];
}

export const useQueueStore = create<QueueState>()(() => ({
  items: [],
  currentIndex: -1,
  source: null,
  originalOrder: [],
}));
