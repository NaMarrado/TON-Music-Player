import type { DownloadCompleteEvent, DownloadErrorEvent, DownloadProgressEvent } from '@ton/core';

export interface DownloadCallbacks {
  onProgress: (event: DownloadProgressEvent) => void;
  onComplete: (event: DownloadCompleteEvent) => void;
  onError: (event: DownloadErrorEvent) => void;
}
