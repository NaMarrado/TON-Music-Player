import type { DownloadCallbacks } from '../downloader';
import { broadcastDownloadEvent } from './broadcast';

export function createDownloadCallbacks(onStateChange: () => void): DownloadCallbacks {
  return {
    onProgress: (event) => {
      broadcastDownloadEvent('download:progress', event);
    },
    onComplete: (event) => {
      broadcastDownloadEvent('download:complete', event);
      onStateChange();
    },
    onError: (event) => {
      broadcastDownloadEvent('download:error', event);
      onStateChange();
    },
  };
}
