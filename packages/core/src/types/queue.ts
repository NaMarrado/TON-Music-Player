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
  youtube_id?: string | null;
  source_index?: number;
}

export type QueueSource = 'user' | 'auto' | 'smart-playlist';

export type PlaybackQueueSourceKind =
  | 'album'
  | 'artist'
  | 'custom'
  | 'library'
  | 'playlist'
  | 'selection'
  | 'single';

export interface PlaybackQueueSourceDescriptor {
  kind: PlaybackQueueSourceKind;
  source_id?: number | string;
  filter_query?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface QueueState {
  items: QueueItem[];
  current_index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  original_order: QueueItem[];
}

export type RepeatMode = 'all' | 'one';

export interface PlaybackSessionSnapshot {
  queue: QueueItem[];
  source_items: QueueItem[];
  previous_windows?: QueueItem[][];
  next_windows?: QueueItem[][];
  next_queue_serial: number;
  current_index: number;
  position_seconds: number;
  repeat: RepeatMode;
  shuffle: boolean;
  source: QueueSource | null;
  source_descriptor?: PlaybackQueueSourceDescriptor | null;
}
