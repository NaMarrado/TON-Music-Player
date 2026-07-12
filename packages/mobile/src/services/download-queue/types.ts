import type { DownloadInput } from '../downloader';
import type { DownloadFormat } from '../downloader';

export type QueueStatus =
  | 'pending'
  | 'downloading'
  | 'retrying'
  | 'completed'
  | 'error';

export interface QueueItem {
  id: number;
  input: DownloadInput;
  status: QueueStatus;
  progress: number;
  error: string | null;
  format: DownloadFormat | null;
  retryCount: number;
  trackId: number | null;
}

export type QueueListener = (items: QueueItem[]) => void;

export interface QueueRow {
  id: number;
  url: string;
  source: DownloadInput['source'];
  source_id: string;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  playlist_id: number | null;
  retry_count: number;
  duration_ms: number | null;
  format: DownloadFormat;
  status: string;
  progress: number;
  error_message: string | null;
  completed_at: number | null;
  settled_notification_sent_at: number | null;
}
