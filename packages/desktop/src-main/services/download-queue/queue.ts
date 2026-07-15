import {
  DOWNLOAD_RETRY_MAX,
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
import { getBackoffDelay } from './queue-helpers';
import { markDownloadError } from '../downloader/status';

export class DownloadQueue {
  private activeDownloads = new Map<number, AbortController>();
  private processing = false;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;
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
    const controller = this.activeDownloads.get(id);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(id);
    }

    markDownloadCancelled(id);
    this.emitStateChange();
  }

  cancelAllActive(): void {
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }

    markAllCancellableDownloadsCancelled();
    for (const controller of this.activeDownloads.values()) {
      controller.abort();
    }
    this.activeDownloads.clear();
    this.emitStateChange();
  }

  retry(id: number): void {
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

    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }

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
    this.consecutiveErrors = 0;
    broadcastDownloadEvent('download:online', {});
    this.emitStateChange();
    this.scheduleNext();
  }

  private scheduleNext(forceDelay = false): void {
    if (this.delayTimer || this.offline || this.activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) {
      return;
    }

    const delay = forceDelay || this.activeDownloads.size > 0
      ? getBackoffDelay(this.consecutiveErrors)
      : 0;
    this.delayTimer = setTimeout(() => {
      this.delayTimer = null;
      this.processNext();
    }, delay);
  }

  private processNext(): void {
    if (this.processing || this.activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) {
      return;
    }

    this.processing = true;

    try {
      const nextDownload = getNextPendingDownload();
      if (!nextDownload) {
        return;
      }

      markDownloadAsStarting(nextDownload.id);
      nextDownload.status = 'downloading';
      this.emitStateChange();

      const controller = new AbortController();
      this.activeDownloads.set(nextDownload.id, controller);
      const callbacks = createDownloadCallbacks(() => this.emitStateChange());
      let didFail = false;

      downloadItem(nextDownload, callbacks, controller.signal)
        .then(() => {
          this.consecutiveErrors = 0;
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }

          const rawMessage = error instanceof Error ? error.message : String(error);
          const isAgeRestricted = isAgeRestrictedDownloadError(rawMessage);
          const message = toDownloadFailureMessage(rawMessage);
          console.warn('[DL-QUEUE] Download failed:', nextDownload.id, rawMessage);

          if (!isAgeRestricted && nextDownload.retry_count < DOWNLOAD_RETRY_MAX) {
            didFail = true;
            this.consecutiveErrors += 1;
            requeueDownloadAfterFailure(nextDownload.id);
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

          if (isAgeRestricted) {
            this.consecutiveErrors = 0;
          } else {
            didFail = true;
            this.consecutiveErrors += 1;
          }

          markDownloadError(nextDownload.id, message);
          callbacks.onError({
            id: nextDownload.id,
            error: message,
            retryable: true,
          });
        })
        .finally(() => {
          this.activeDownloads.delete(nextDownload.id);
          this.emitStateChange();
          this.scheduleNext(didFail);
        });

      if (this.activeDownloads.size < MAX_CONCURRENT_DOWNLOADS) {
        this.scheduleNext();
      }
    } finally {
      this.processing = false;
    }
  }

  private emitStateChange(): void {
    for (const listener of this.stateListeners) {
      listener();
    }
  }
}
