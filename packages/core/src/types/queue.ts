export interface QueueItem {
  id: string;
  track_id: number;
  added_by: QueueSource;
  playlist_track_id?: number;
  file_path?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  duration_ms?: number | null;
  cover_art_path?: string | null;
  loudness_gain?: number | null;
}

export type QueueSource = 'user' | 'auto' | 'smart-playlist';

export interface QueueState {
  items: QueueItem[];
  current_index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  original_order: QueueItem[];
}

export type RepeatMode = 'all' | 'one';
