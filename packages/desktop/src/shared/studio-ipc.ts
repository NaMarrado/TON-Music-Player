import type { DownloadSource, StudioProject } from '@ton/core';

export interface StudioTempDownloadRequest {
  source: DownloadSource;
  url: string;
  title: string;
  artist: string;
  durationMs: number | null;
}

export interface StudioTempDownloadResult {
  path: string;
}

export interface StudioExportRequest {
  project: StudioProject;
  title: string;
  artist: string;
}

export interface StudioExportResult {
  trackId: number;
  filePath: string;
  durationSec: number;
}

export interface StudioProgressEvent {
  id: string;
  kind: 'download' | 'export';
  progress: number;
}
