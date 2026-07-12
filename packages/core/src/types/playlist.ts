export interface Playlist {
  id: number;
  cloud_id: string | null;
  name: string;
  description: string | null;
  cover_path: string | null;
  is_smart: boolean;
  smart_rules: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface PlaylistTrack {
  id: number;
  playlist_id: number;
  track_id: number;
  position: number;
  file_path: string | null;
  added_at: number;
}

/** Track data extended with the playlist_tracks row ID for unique identification. */
export type PlaylistTrackEntry = import('./track').Track & { playlist_track_id: number };

export type SmartRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'in_last_days';

export type SmartRuleField =
  | 'artist'
  | 'album'
  | 'genre'
  | 'year'
  | 'play_count'
  | 'rating'
  | 'added_at'
  | 'last_played_at'
  | 'duration_ms';

export interface SmartRule {
  field: SmartRuleField;
  operator: SmartRuleOperator;
  value: string | number;
  value2?: number;
}

export type SmartRuleLogic = 'all' | 'any';

export interface SmartPlaylistConfig {
  logic: SmartRuleLogic;
  rules: SmartRule[];
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
