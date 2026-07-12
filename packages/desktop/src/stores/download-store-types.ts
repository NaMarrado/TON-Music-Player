import type { DownloadItem } from '@ton/core';

export interface DownloadRuntimeMeta {
  eta: string;
  indeterminate: boolean;
  size: string;
  speed: string;
}

export interface DownloadState {
  itemsById: Record<number, DownloadItem>;
  orderedIds: number[];
  activeCount: number;
  isLoading: boolean;
  runtimeMetaById: Record<number, DownloadRuntimeMeta>;
}
