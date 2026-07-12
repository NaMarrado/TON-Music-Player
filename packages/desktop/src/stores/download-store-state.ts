import { create } from 'zustand';
import type { DownloadItem, DownloadRequest } from '@ton/core';
import type { DownloadRuntimeMeta, DownloadState } from './download-store-types';

export const useDownloadStore = create<DownloadState>()(() => ({
  items: [],
  activeCount: 0,
  isLoading: false,
  runtimeMetaById: {},
}));

export function getActiveCount(items: DownloadItem[]): number {
  return items.filter((item) =>
    ['downloading', 'resolving', 'converting'].includes(item.status),
  ).length;
}

export function pruneRuntimeMeta(
  items: DownloadItem[],
  runtimeMetaById: Record<number, DownloadRuntimeMeta>,
): Record<number, DownloadRuntimeMeta> {
  const allowedIds = new Set(items.map((item) => item.id));
  return Object.fromEntries(
    Object.entries(runtimeMetaById).filter(([id]) => allowedIds.has(Number(id))),
  );
}

export function setDownloadSnapshot(items: DownloadItem[], isLoading = false): void {
  const { runtimeMetaById } = useDownloadStore.getState();
  useDownloadStore.setState({
    items,
    activeCount: getActiveCount(items),
    isLoading,
    runtimeMetaById: pruneRuntimeMeta(items, runtimeMetaById),
  });
}

export function setRuntimeMeta(id: number, meta: DownloadRuntimeMeta): void {
  const { runtimeMetaById } = useDownloadStore.getState();
  useDownloadStore.setState({
    runtimeMetaById: {
      ...runtimeMetaById,
      [id]: meta,
    },
  });
}

export function clearRuntimeMeta(id: number): void {
  const { runtimeMetaById } = useDownloadStore.getState();
  if (!(id in runtimeMetaById)) {
    return;
  }

  const nextMeta = { ...runtimeMetaById };
  delete nextMeta[id];
  useDownloadStore.setState({ runtimeMetaById: nextMeta });
}

export function patchDownloadItem(
  id: number,
  updater: (item: DownloadItem) => DownloadItem,
): boolean {
  const { items } = useDownloadStore.getState();
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id !== id) {
      return item;
    }

    changed = true;
    return updater(item);
  });

  if (!changed) {
    return false;
  }

  setDownloadSnapshot(nextItems);
  return true;
}

export function patchDownloadById(id: number, patch: Partial<DownloadItem>): boolean {
  return patchDownloadItem(id, (item) => ({
    ...item,
    ...patch,
  }));
}

export function createPendingDownloadItem(id: number, request: DownloadRequest): DownloadItem {
  return {
    id,
    url: request.url ?? null,
    source: request.source,
    source_id: request.source_id ?? null,
    title: request.title ?? null,
    artist: request.artist ?? null,
    album: request.album ?? null,
    cover_url: request.cover_url ?? null,
    playlist_id: request.playlist_id ?? null,
    format: request.format ?? 'opus',
    status: 'pending',
    progress: 0,
    error_message: null,
    retry_count: 0,
    priority: 0,
    created_at: Math.floor(Date.now() / 1000),
    completed_at: null,
  };
}

export function appendDownloadItem(item: DownloadItem): void {
  const { items } = useDownloadStore.getState();
  const existingIndex = items.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    const nextItems = items.slice();
    nextItems[existingIndex] = item;
    setDownloadSnapshot(nextItems);
    return;
  }

  setDownloadSnapshot([...items, item]);
}

export function removeDownloads(predicate: (item: DownloadItem) => boolean): void {
  const { items } = useDownloadStore.getState();
  setDownloadSnapshot(items.filter((item) => !predicate(item)));
}
