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
