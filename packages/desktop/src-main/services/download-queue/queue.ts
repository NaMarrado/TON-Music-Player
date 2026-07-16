import {
  DOWNLOAD_RETRY_MAX,
  DOWNLOAD_RETRY_DELAY_MS,
  getDownloadSlotsToFill,
  isAgeRestrictedDownloadError,
  MAX_CONCURRENT_DOWNLOADS,
  toDownloadFailureMessage,
} from '@ton/core';
import type { DownloadItem, DownloadRequest } from '@ton/core';
import { downloadItem } from '../downloader';
import { createDownloadCallbacks } from './callbacks';
import { broadcastDownloadEvent } from './broadcast';
import {
  clearCompletedDownloads,
  clearFailedDownloads,
  clearNonActiveDownloads,
  countPendingOrActiveDownloads,
  getNextPendingDownload,
  getSpotifyPlaylistSourcePositions,
  insertDownloadRequest,
  listDownloads,
  markAllCancellableDownloadsCancelled,
  markDownloadAsStarting,
  markDownloadCancelled,
  requeueDownloadAfterFailure,
  resetDownloadForRetry,
  resetDownloadsToPending,
  resumeInterruptedDownloads,
} from './queue-db';
import { markDownloadError } from '../downloader/status';

export class DownloadQueue {
  private activeDownloads = new Map<number, AbortController>();
  private processing = false;
  private retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private offline = false;
  private stateListeners = new Set<() => void>();

  resumeOnStartup(): void {
    resumeInterruptedDownloads();
    this.emitStateChange();
    this.scheduleNext();
  }

  enqueue(request: DownloadRequest): number {
    const id = insertDownloadRequest(request);
    this.emitStateChange();
    this.scheduleNext();
    return id;
  }

  cancel(id: number): void {
    this.clearRetryTimer(id);
    const controller = this.activeDownloads.get(id);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(id);
    }

    markDownloadCancelled(id);
    this.emitStateChange();
  }

  cancelAllActive(): void {
    this.clearAllRetryTimers();

    markAllCancellableDownloadsCancelled();
    for (const controller of this.activeDownloads.values()) {
      controller.abort();
    }
    this.activeDownloads.clear();
    this.emitStateChange();
  }

  retry(id: number): void {
    this.clearRetryTimer(id);
    resetDownloadForRetry(id);
    this.emitStateChange();
    this.scheduleNext();
  }

  clearCompleted(): void {
    clearCompletedDownloads();
    this.emitStateChange();
  }

  clearFailed(): void {
    clearFailedDownloads();
    this.emitStateChange();
  }

  clearAll(): void {
    clearNonActiveDownloads();
    this.emitStateChange();
  }

  getAll(): DownloadItem[] {
    return listDownloads();
  }

  hasActive(): boolean {
    return this.activeDownloads.size > 0 || countPendingOrActiveDownloads() > 0;
  }

  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  goOffline(): void {
    if (this.offline) {
      return;
    }

    this.offline = true;

    for (const controller of this.activeDownloads.values()) {
      controller.abort();
    }

    resetDownloadsToPending(this.activeDownloads.keys());
    this.activeDownloads.clear();
    broadcastDownloadEvent('download:offline', {});
    this.emitStateChange();
  }

  goOnline(): void {
    if (!this.offline) {
      return;
    }

    this.offline = false;
    broadcastDownloadEvent('download:online', {});
    this.emitStateChange();
    this.scheduleNext();
  }

  private processNext(): void {
    if (this.processing || this.activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) {
      return;
    }

    this.processing = true;

    try {
      let slotsToFill = getDownloadSlotsToFill(this.activeDownloads.size);
      while (!this.offline && slotsToFill > 0) {
        const nextDownload = getNextPendingDownload(this.retryTimers.keys());
        if (!nextDownload) {
          break;
        }

        markDownloadAsStarting(nextDownload.id);
        nextDownload.status = 'downloading';
        this.emitStateChange();

        const controller = new AbortController();
        this.activeDownloads.set(nextDownload.id, controller);
        slotsToFill -= 1;
        const callbacks = createDownloadCallbacks(() => this.emitStateChange());

        downloadItem(nextDownload, callbacks, controller.signal)
          .catch((error: unknown) => {
            if (controller.signal.aborted) {
              return;
            }

            const rawMessage = error instanceof Error ? error.message : String(error);
            const isAgeRestricted = isAgeRestrictedDownloadError(rawMessage);
            const message = toDownloadFailureMessage(rawMessage);
            console.warn('[DL-QUEUE] Download failed:', nextDownload.id, rawMessage);

            if (!isAgeRestricted && nextDownload.retry_count < DOWNLOAD_RETRY_MAX) {
              requeueDownloadAfterFailure(nextDownload.id);
              this.scheduleRetry(nextDownload.id);
              callbacks.onProgress({
                id: nextDownload.id,
                status: 'pending',
                progress: 0,
                speed: '',
                eta: '',
                size: '',
              });
              return;
            }

            const playlistSourcePositions = getSpotifyPlaylistSourcePositions(nextDownload.id);
            markDownloadError(nextDownload.id, message);
            callbacks.onError({
              id: nextDownload.id,
              error: message,
              retryable: true,
              playlistSourcePositions,
            });
          })
          .finally(() => {
            this.activeDownloads.delete(nextDownload.id);
            this.emitStateChange();
            this.processNext();
          });
      }
    } finally {
      this.processing = false;
    }
  }

  private scheduleNext(): void {
    this.processNext();
  }

  private scheduleRetry(id: number): void {
    this.clearRetryTimer(id);
    const timer = setTimeout(() => {
      this.retryTimers.delete(id);
      this.processNext();
    }, DOWNLOAD_RETRY_DELAY_MS);
    this.retryTimers.set(id, timer);
  }

  private clearRetryTimer(id: number): void {
    const timer = this.retryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(id);
    }
  }

  private clearAllRetryTimers(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }

  private emitStateChange(): void {
    for (const listener of this.stateListeners) {
      listener();
    }
  }
}
