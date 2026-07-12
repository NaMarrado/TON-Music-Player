export interface DownloadInput {
  source: 'spotify' | 'youtube';
  sourceId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  coverUrl: string | null;
  sourceUrl: string;
  playlistId: number | null;
}

export type DownloadFormat = 'webm' | 'm4a' | 'opus' | 'aac' | 'mp3';

export interface DownloadResult {
  trackId: number;
  filePath: string;
}

export interface DownloadResolvedSourceInfo {
  coverUrl: string | null;
  contentLength: number;
  filePath: string;
  format: DownloadFormat;
  mimeType: string;
  safeName: string;
  strategy: string;
  url: string;
  videoId: string;
}

export interface DownloadRuntimeOptions {
  onCancelable?: (cancel: () => Promise<void>) => void;
  onProgress?: (progress: number) => void;
  onResolved?: (source: DownloadResolvedSourceInfo) => void | Promise<void>;
  isCancelled?: () => boolean;
}
