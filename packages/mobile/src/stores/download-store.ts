import { create } from 'zustand';
import type { QueueStatus } from '../services/download-queue';
import { ensureDownloadRuntimePermission } from '../services/download-runtime';
import { getDownloadQueue } from '../services/download-queue';
import { countPerfEvent } from '../services/perf';
import type { DownloadInput } from '../services/downloader';
import {
  EMPTY_IDS_BY_STATUS,
  getExistingLibraryTrackIds,
  getExistingLibraryTrackId,
  normalizeItems,
  syncCompletedLibraryTracks,
  type DownloadIdsByStatus,
  type DownloadQueueItem,
} from './download-store-helpers';

interface DownloadState {
  itemsById: Record<number, DownloadQueueItem>;
  orderedIds: number[];
  idsByStatus: DownloadIdsByStatus;
  isSubscribed: boolean;
}

export interface EnqueueDownloadResult {
  id: number | null;
  status: 'queued' | 'duplicate' | 'saved';
  libraryTrackId?: number;
}

export interface EnqueueDownloadBatchResult {
  duplicateCount: number;
  ids: number[];
  queuedCount: number;
  savedCount: number;
}

export const useDownloadStore = create<DownloadState>()(() => ({
  itemsById: {},
  orderedIds: [],
  idsByStatus: EMPTY_IDS_BY_STATUS(),
  isSubscribed: false,
}));

let unsubscribe: (() => void) | null = null;

export function subscribeToDownloads(): () => void {
  if (unsubscribe) {
    return () => {};
  }

  const queue = getDownloadQueue();

  unsubscribe = queue.subscribe((items) => {
    const previousItemsById = useDownloadStore.getState().itemsById;
    countPerfEvent('downloads:snapshot');
    useDownloadStore.setState({
      ...normalizeItems(items),
      isSubscribed: true,
    });

    void syncCompletedLibraryTracks(items, previousItemsById);
  });

  return () => {
    // Downloads stay subscribed for the app lifetime to avoid queue fanout churn.
  };
}

export async function enqueueDownload(input: DownloadInput): Promise<EnqueueDownloadResult> {
  const existingLibraryTrackId = await getExistingLibraryTrackId(input);
  if (existingLibraryTrackId != null) {
    return {
      id: null,
      status: 'saved',
      libraryTrackId: existingLibraryTrackId,
    };
  }

  const queue = getDownloadQueue();
  const duplicate = queue.findDuplicate(input);
  if (duplicate) {
    return {
      id: duplicate.id,
      status: 'duplicate',
    };
  }

  await ensureDownloadRuntimePermission().catch(() => false);
  const id = await queue.enqueue(input);
  return {
    id,
    status: 'queued',
  };
}

export async function enqueueDownloadBatch(
  inputs: DownloadInput[],
  onProgress?: (current: number, total: number) => void,
): Promise<EnqueueDownloadBatchResult> {
  if (inputs.length === 0) {
    return {
      duplicateCount: 0,
      ids: [],
      queuedCount: 0,
      savedCount: 0,
    };
  }

  const existingTrackIds = await getExistingLibraryTrackIds(inputs);
  const queue = getDownloadQueue();
  const plannedSourceIds = new Set<string>();
  const queuedInputs: DownloadInput[] = [];
  let duplicateCount = 0;
  let savedCount = 0;

  for (const input of inputs) {
    const sourceKey = `${input.source}:${input.sourceId}`;
    const isAlreadySaved = existingTrackIds[sourceKey] != null;
    if (isAlreadySaved) {
      savedCount += 1;
      continue;
    }

    const duplicate = queue.findDuplicate(input) || plannedSourceIds.has(sourceKey);
    if (duplicate) {
      duplicateCount += 1;
      continue;
    }

    queuedInputs.push(input);
    plannedSourceIds.add(sourceKey);
  }

  if (queuedInputs.length === 0) {
    return {
      duplicateCount,
      ids: [],
      queuedCount: 0,
      savedCount,
    };
  }

  await ensureDownloadRuntimePermission().catch(() => false);
  const ids = await queue.enqueueBatch(queuedInputs, {
    notifyEvery: 20,
    onProgress,
  });

  return {
    duplicateCount,
    ids,
    queuedCount: ids.length,
    savedCount,
  };
}

export function cancelDownload(id: number): Promise<void> {
  return getDownloadQueue().cancel(id);
}

export function cancelAllDownloads(): Promise<void> {
  return getDownloadQueue().cancelAllActive();
}

export async function retryDownload(id: number): Promise<void> {
  await getDownloadQueue().retry(id);
}

export function clearCompleted(): void {
  getDownloadQueue().clearCompleted();
}

export function clearFailed(): void {
  getDownloadQueue().clearFailed();
}

export function clearAll(): void {
  getDownloadQueue().clearAll();
}

export function useDownloadItem(id: number): DownloadQueueItem | undefined {
  return useDownloadStore((state) => state.itemsById[id]);
}

export function useDownloadIdsByStatus(status: QueueStatus): number[] {
  return useDownloadStore((state) => state.idsByStatus[status]);
}

export function useDownloadCount(): number {
  return useDownloadStore((state) => state.orderedIds.length);
}

export function getActiveItems(): DownloadQueueItem[] {
  const state = useDownloadStore.getState();
  return [...state.idsByStatus.downloading, ...state.idsByStatus.retrying]
    .map((id) => state.itemsById[id])
    .filter(Boolean);
}

export function getPendingItems(): DownloadQueueItem[] {
  const state = useDownloadStore.getState();
  return state.idsByStatus.pending.map((id) => state.itemsById[id]).filter(Boolean);
}

export function getCompletedItems(): DownloadQueueItem[] {
  const state = useDownloadStore.getState();
  return state.idsByStatus.completed.map((id) => state.itemsById[id]).filter(Boolean);
}

export function getErrorItems(): DownloadQueueItem[] {
  const state = useDownloadStore.getState();
  return state.idsByStatus.error.map((id) => state.itemsById[id]).filter(Boolean);
}
