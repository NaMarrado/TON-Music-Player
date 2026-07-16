import { MAX_CONCURRENT_DOWNLOADS } from './constants';

export function getDownloadSlotsToFill(activeCount: number): number {
  const normalizedActiveCount = Number.isFinite(activeCount)
    ? Math.max(0, Math.floor(activeCount))
    : 0;
  return Math.max(0, MAX_CONCURRENT_DOWNLOADS - normalizedActiveCount);
}
