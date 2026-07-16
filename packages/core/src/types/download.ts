export interface DownloadItem {
  id: number;
  url: string | null;
  source: DownloadSource;
  source_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  cover_url: string | null;
  duration_ms?: number | null;
  playlist_id: number | null;
  resolved_cover_url?: string | null;
  resolved_source_id?: string | null;
  format: string;
  quality_profile: DownloadQualityProfile;
  status: DownloadStatus;
  progress: number;
  error_message: string | null;
  retry_count: number;
  priority: number;
  created_at: number;
  completed_at: number | null;
  playlist_source_positions?: number[];
}

export type DownloadSource = 'youtube' | 'spotify' | 'soundcloud';

export type DownloadStatus =
  | 'pending'
  | 'resolving'
  | 'downloading'
  | 'converting'
  | 'done'
  | 'error'
  | 'cancelled';

export interface DownloadRequest {
  url?: string;
  source: DownloadSource;
  source_id?: string;
  title?: string;
  artist?: string;
  album?: string;
  cover_url?: string;
  playlist_id?: number;
  format?: string;
  quality_profile?: DownloadQualityProfile;
  duration_ms?: number;
}

import type { DownloadQualityProfile } from './settings';

export interface DownloadProgressEvent {
  id: number;
  progress: number;
  speed: string;
  eta: string;
  size: string;
  status: DownloadStatus;
}

export interface DownloadCompleteEvent {
  id: number;
  trackId: number;
  filePath: string;
  playlistIds?: number[];
}

export interface DownloadErrorEvent {
  id: number;
  error: string;
  retryable: boolean;
  playlistSourcePositions?: number[];
}

export interface SpotifyPlaylistTrack {
  spotify_id: string;
  title: string;
  artist: string;
  album: string;
  duration_ms: number;
  cover_url: string | null;
}

export interface YouTubePlaylistTrack {
  youtube_id: string;
  title: string;
  artist: string;
  duration_ms: number;
  cover_url: string | null;
}
