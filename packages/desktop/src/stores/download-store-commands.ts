import type { DownloadItem, DownloadRequest, PlaylistImportResult } from '@ton/core';
import { showToast } from './toast-store';
import { countPerfEvent, measurePerfAsync } from '../utils/perf';
import { loadPlaylists } from './playlist-store';
import {
  appendDownloadItem,
  clearRuntimeMeta,
  createPendingDownloadItem,
  patchDownloadById,
  removeDownloads,
  setDownloadSnapshot,
  useDownloadStore,
} from './download-store-state';

const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;

export async function loadDownloads(): Promise<void> {
  useDownloadStore.setState({ isLoading: true });
  try {
    const items = (await measurePerfAsync(
      'downloads:load-snapshot',
      async () => ipc('download:get-all') as Promise<DownloadItem[]>,
    )) as DownloadItem[];
    setDownloadSnapshot(items);
  } catch {
    useDownloadStore.setState({ isLoading: false });
  }
}

export async function startDownload(request: DownloadRequest): Promise<number> {
  try {
    const storedProfile = request.quality_profile
      ?? (await ipc('settings:get', 'download_quality_profile') === 'best_compatible'
        ? 'best_compatible'
        : 'normal');
    const persistedRequest = { ...request, quality_profile: storedProfile };
    const id = (await ipc('download:start', persistedRequest)) as number;
    appendDownloadItem(createPendingDownloadItem(id, persistedRequest));
    return id;
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Failed to start download', 'error');
    throw error;
  }
}

export async function cancelDownload(id: number): Promise<void> {
  await ipc('download:cancel', id);
  clearRuntimeMeta(id);
  if (!patchDownloadById(id, {
    status: 'cancelled',
    error_message: null,
  })) {
    await loadDownloads();
  }
}

export async function cancelAllDownloads(): Promise<void> {
  await ipc('download:cancel-all');
  const state = useDownloadStore.getState();
  const items = state.orderedIds.map((id) => state.itemsById[id]).filter(Boolean);
  const cancellableStatuses = new Set(['pending', 'downloading', 'resolving', 'converting']);

  for (const item of items) {
    if (cancellableStatuses.has(item.status)) {
      clearRuntimeMeta(item.id);
    }
  }

  setDownloadSnapshot(items.map((item) => (
    cancellableStatuses.has(item.status)
      ? { ...item, status: 'cancelled' as const, error_message: null }
      : item
  )));
}

export async function retryDownload(id: number): Promise<void> {
  await ipc('download:retry', id);
  clearRuntimeMeta(id);
  if (!patchDownloadById(id, {
    status: 'pending',
    progress: 0,
    error_message: null,
    completed_at: null,
  })) {
    await loadDownloads();
  }
}

export async function clearCompleted(): Promise<void> {
  await ipc('download:clear-completed');
  removeDownloads((item) => item.status === 'done');
  showToast('Cleared completed', 'info');
}

export async function clearFailed(): Promise<void> {
  await ipc('download:clear-failed');
  removeDownloads((item) => item.status === 'error' || item.status === 'cancelled');
  showToast('Cleared failed', 'info');
}

export async function clearAll(): Promise<void> {
  await ipc('download:clear-all');
  removeDownloads((item) =>
    item.status === 'done'
    || item.status === 'cancelled'
    || item.status === 'error');
  showToast('Cleared all', 'info');
}

export async function importPlaylist(
  url: string,
): Promise<PlaylistImportResult> {
  countPerfEvent('downloads:import-playlist');
  const result = (await ipc('download:import-playlist', { url })) as PlaylistImportResult;
  await loadDownloads();
  await loadPlaylists({ force: true });
  return result;
}
