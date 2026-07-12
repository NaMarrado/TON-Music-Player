import { MobileDownloadQueue } from './queue';

export { MobileDownloadQueue } from './queue';
export type { QueueItem, QueueListener, QueueStatus } from './types';

let queue: MobileDownloadQueue | null = null;

export function getDownloadQueue(): MobileDownloadQueue {
  if (!queue) {
    queue = new MobileDownloadQueue();
  }
  return queue;
}
