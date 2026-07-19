import type { DownloadFormat } from '../downloader';

export type IosBackgroundDownloadState =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface IosBackgroundDownloadActivityRequest {
  activeNotificationBody: string;
  activeNotificationTitle: string;
  artist: string;
  itemId: number;
  title: string;
}

export interface IosBackgroundDownloadRequest {
  activeNotificationBody: string;
  activeNotificationTitle: string;
  artist: string;
  contentLength?: number;
  coverUrl?: string | null;
  destinationPath: string;
  format: DownloadFormat;
  headers: Record<string, string>;
  itemId: number;
  safeName: string;
  silent?: boolean;
  strategy?: string;
  title: string;
  url: string;
  videoId: string;
}

export interface IosBackgroundDownloadSnapshotItem {
  artist: string;
  bytesWritten: number;
  coverUrl: string | null;
  destinationPath: string;
  error: string | null;
  format: DownloadFormat;
  headers?: Record<string, string>;
  itemId: number;
  progress: number;
  safeName: string;
  silent?: boolean;
  state: IosBackgroundDownloadState;
  strategy?: string | null;
  title: string;
  totalBytes: number | null;
  url: string;
  videoId: string;
}

export interface IosBackgroundDownloadSnapshot {
  items: IosBackgroundDownloadSnapshotItem[];
}

export type IosBackgroundDownloadEvent = IosBackgroundDownloadSnapshotItem;

export const IOS_CLOUD_SYNC_DOWNLOAD_STRATEGY = 'r2-cloud-sync';

export function isIosCloudSyncBackgroundItem(
  item: Pick<IosBackgroundDownloadSnapshotItem, 'strategy'>,
): boolean {
  return item.strategy === IOS_CLOUD_SYNC_DOWNLOAD_STRATEGY;
}
