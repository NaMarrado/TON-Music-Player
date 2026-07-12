import { formatSize, type DownloadProgressEvent } from '@ton/core';
import { parseProgressLine } from './parse-progress-line';
import { updateDownloadProgress, updateDownloadStatus } from './status';
import type { DownloadCallbacks } from './types';

function formatEta(seconds: number | null): string {
  if (seconds == null || seconds <= 0) {
    return '';
  }

  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatSpeed(speedBytesPerSecond: number | null): string {
  if (speedBytesPerSecond == null || speedBytesPerSecond <= 0) {
    return '';
  }

  return `${formatSize(speedBytesPerSecond)}/s`;
}

function formatSizeLabel(downloadedBytes: number | null, totalBytes: number | null): string {
  if (totalBytes != null && totalBytes > 0) {
    return formatSize(totalBytes);
  }

  if (downloadedBytes != null && downloadedBytes > 0) {
    return formatSize(downloadedBytes);
  }

  return '';
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, progress));
}

function persistProgress(
  id: number,
  status: DownloadProgressEvent['status'],
  progress: number,
): boolean {
  if (!Number.isFinite(progress)) {
    return updateDownloadStatus(id, status);
  }

  return updateDownloadProgress(id, status, progress);
}

export function createProgressBridge(
  id: number,
  callbacks: DownloadCallbacks,
) {
  const emit = (event: Omit<DownloadProgressEvent, 'id'>) => {
    if (!persistProgress(id, event.status, event.progress)) {
      return;
    }
    callbacks.onProgress({ id, ...event });
  };

  return {
    emitDownloadStarted() {
      emit({
        status: 'downloading',
        progress: Number.NaN,
        speed: '',
        eta: '',
        size: '',
      });
    },

    handleLine(line: string): boolean {
      const parsed = parseProgressLine(line);
      if (!parsed) {
        return false;
      }

      if (parsed.status === 'finished') {
        emit({
          status: 'converting',
          progress: Number.NaN,
          speed: '',
          eta: '',
          size: formatSizeLabel(parsed.downloadedBytes, parsed.totalBytes),
        });
        return true;
      }

      const totalBytes = parsed.totalBytes ?? parsed.totalBytesEstimate;
      const progress =
        totalBytes != null && totalBytes > 0 && parsed.downloadedBytes != null
          ? clampProgress(parsed.downloadedBytes / totalBytes)
          : Number.NaN;

      emit({
        status: 'downloading',
        progress,
        speed: formatSpeed(parsed.speedBytesPerSecond),
        eta: formatEta(parsed.etaSeconds),
        size: formatSizeLabel(parsed.downloadedBytes, totalBytes),
      });
      return true;
    },
  };
}

export type ProgressBridge = ReturnType<typeof createProgressBridge>;
