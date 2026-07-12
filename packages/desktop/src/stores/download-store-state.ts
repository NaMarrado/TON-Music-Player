import { create } from 'zustand';
import type { DownloadItem, DownloadRequest } from '@ton/core';
import type { DownloadRuntimeMeta, DownloadState } from './download-store-types';

export const useDownloadStore = create<DownloadState>()(() => ({
  itemsById: {},
  orderedIds: [],
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
    itemsById: Object.fromEntries(items.map((item) => [item.id, item])),
    orderedIds: items.map((item) => item.id),
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
  const state = useDownloadStore.getState();
  const current = state.itemsById[id];
  if (!current) return false;
  const updated = updater(current);
  const wasActive = ['downloading', 'resolving', 'converting'].includes(current.status);
  const isActive = ['downloading', 'resolving', 'converting'].includes(updated.status);
  useDownloadStore.setState({
    itemsById: { ...state.itemsById, [id]: updated },
    activeCount: state.activeCount + Number(isActive) - Number(wasActive),
  });
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
    format: 'm4a',
    quality_profile: request.quality_profile ?? 'normal',
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
  const state = useDownloadStore.getState();
  if (state.itemsById[item.id]) {
    patchDownloadItem(item.id, () => item);
    return;
  }
  useDownloadStore.setState({
    itemsById: { ...state.itemsById, [item.id]: item },
    orderedIds: [...state.orderedIds, item.id],
    activeCount: state.activeCount + Number(
      ['downloading', 'resolving', 'converting'].includes(item.status),
    ),
  });
}

export function removeDownloads(predicate: (item: DownloadItem) => boolean): void {
  const state = useDownloadStore.getState();
  const items = state.orderedIds.map((id) => state.itemsById[id]).filter(Boolean);
  setDownloadSnapshot(items.filter((item) => !predicate(item)));
}
