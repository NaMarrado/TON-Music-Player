import type { Track } from './track';
import type { ListeningInterval, PlaybackObservation, ProfileAnalytics, ProfileDevice } from './profile';

export interface PlayHistoryEntry {
  id: number;
  track_id: number;
  played_at: number;
  duration_ms: number | null;
  completed: boolean;
}

/** A measured playback session; all timestamps and listening totals are milliseconds. */
export interface ListeningSessionSnapshot {
  session_id: string;
  track_id: number;
  started_at: number;
  listened_ms: number;
  completed: boolean;
  ended_at: number | null;
  device?: ProfileDevice;
  intervals?: ListeningInterval[];
  observations?: PlaybackObservation[];
}

export interface ProfileHistoryEntry {
  session_id: string;
  played_at: number;
  listened_ms: number;
  completed: boolean;
  ended_at: number | null;
  track: Track;
}

export interface ListeningProfileSummary {
  total_listened_ms: number;
  measurement_started_at: number;
  total_plays: number;
  favorite_count: number;
  favorites: Track[];
  most_played: Track[];
  recent: ProfileHistoryEntry[];
  analytics: ProfileAnalytics;
}
