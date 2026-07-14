import type {
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
} from '@ton/core';
import { showToast } from './toast-store';
import {
  reconcileLibraryTracks,
} from './library-store';
import {
  clearRuntimeMeta,
  patchDownloadItem,
  setRuntimeMeta,
  useDownloadStore,
} from './download-store-state';
import { loadDownloads } from './download-store-commands';
import { countPerfEvent } from '../utils/perf';
import { mergeCompletedTrackIntoPlaylists } from './playlist-store';

export function subscribeToDownloadEvents(): () => void {
  const handleProgress = (data: unknown) => {
    countPerfEvent('downloads:progress-event');
    const event = data as DownloadProgressEvent;
    setRuntimeMeta(event.id, {
      indeterminate: !Number.isFinite(event.progress),
      speed: event.speed,
      eta: event.eta,
      size: event.size,
    });
    const wasPatched = patchDownloadItem(event.id, (item) => ({
      ...item,
      progress: Number.isFinite(event.progress) ? event.progress : item.progress,
      status: event.status,
    }));
    if (!wasPatched) {
      void loadDownloads();
    }
  };

  const handleComplete = (data: unknown) => {
    countPerfEvent('downloads:complete-event');
    const event = data as DownloadCompleteEvent;
    clearRuntimeMeta(event.id);
    const item = useDownloadStore.getState().itemsById[event.id];
    const title = item?.title || 'Download';
    showToast(`${title} — completed`, 'success');
    const wasPatched = patchDownloadItem(event.id, (entry) => ({
      ...entry,
      status: 'done',
      progress: 1,
      completed_at: Math.floor(Date.now() / 1000),
      error_message: null,
    }));
    if (!wasPatched) {
      void loadDownloads();
    }

    if (event.playlistIds?.length) {
      void mergeCompletedTrackIntoPlaylists(event.trackId, event.playlistIds);
    }

    void reconcileLibraryTracks().catch(() => {});
  };

  const handleError = (data: unknown) => {
    countPerfEvent('downloads:error-event');
    const event = data as DownloadErrorEvent;
    clearRuntimeMeta(event.id);
    const item = useDownloadStore.getState().itemsById[event.id];
    const title = item?.title || 'Download';
    showToast(`${title} — failed`, 'error', 5000);
    const wasPatched = patchDownloadItem(event.id, (entry) => ({
      ...entry,
      status: 'error',
      error_message: event.error,
    }));
    if (!wasPatched) {
      void loadDownloads();
    }
  };

  window.api.on('download:progress', handleProgress);
  window.api.on('download:complete', handleComplete);
  window.api.on('download:error', handleError);

  return () => {
    window.api.off('download:progress', handleProgress);
    window.api.off('download:complete', handleComplete);
    window.api.off('download:error', handleError);
  };
}
