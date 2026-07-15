import type { DownloadInput } from '../downloader';
import { maybeStartDownloadBackgroundWork } from '../download-runtime';
import { getSetting } from '../db-queries/settings';
import {
  deleteQueueItemRecords,
  insertQueueItemRecord,
  insertQueueItemRecords,
} from './db';
import { createPendingQueueItem } from './items';
import type { MobileDownloadQueue } from './queue';

export async function enqueueQueueItem(
  queue: MobileDownloadQueue,
  input: DownloadInput,
): Promise<number> {
  const qualityProfile = input.qualityProfile
    ?? (await getSetting('download_quality_profile') === 'best_compatible'
      ? 'best_compatible'
      : 'normal');
  const persistedInput = { ...input, qualityProfile };
  const id = await insertQueueItemRecord(persistedInput);
  queue.runtime.cancellingIds.delete(id);
  queue.runtime.items.push(createPendingQueueItem(id, persistedInput));
  queue.notify();
  queue.processNext();
  void maybeStartDownloadBackgroundWork('resume', id);
  return id;
}

export async function enqueueQueueItems(
  queue: MobileDownloadQueue,
  inputs: DownloadInput[],
  options: {
    notifyEvery?: number;
    onInserted?: (inserted: Array<{ id: number; input: DownloadInput }>) => void | Promise<void>;
    onProgress?: (current: number, total: number) => void;
  } = {},
): Promise<number[]> {
  if (inputs.length === 0) return [];
  const { notifyEvery = 20, onInserted, onProgress } = options;
  const storedProfile = await getSetting('download_quality_profile');
  const qualityProfile = storedProfile === 'best_compatible' ? 'best_compatible' : 'normal';
  const persistedInputs = inputs.map((input) => ({
    ...input,
    qualityProfile: input.qualityProfile ?? qualityProfile,
  }));
  const inserted = await insertQueueItemRecords(persistedInputs);
  try {
    await onInserted?.(inserted);
  } catch (error) {
    await deleteQueueItemRecords(inserted.map((item) => item.id));
    throw error;
  }
  const ids: number[] = [];
  for (let index = 0; index < inserted.length; index += 1) {
    const item = inserted[index];
    queue.runtime.cancellingIds.delete(item.id);
    ids.push(item.id);
    queue.runtime.items.push(createPendingQueueItem(item.id, item.input));
    onProgress?.(index + 1, inserted.length);
    if ((index + 1) % notifyEvery === 0) queue.notify();
  }
  queue.notify();
  queue.processNext();
  void maybeStartDownloadBackgroundWork('resume', ids[0] ?? null);
  return ids;
}
