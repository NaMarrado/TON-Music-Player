export { DownloadQueue } from './queue';
import { DownloadQueue } from './queue';

let instance: DownloadQueue | null = null;

export function getDownloadQueue(): DownloadQueue {
  if (!instance) {
    instance = new DownloadQueue();
  }

  return instance;
}
