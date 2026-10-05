import type { Track } from './track';

export type ProfilePeriod = 'week' | 'month' | 'year' | 'all';
export interface ProfileQuery {
  period: ProfilePeriod;
  year?: number;
  device_id?: string;
}

export interface ProfileDevice {
  device_id: string;
  name: string;
  platform: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';
}
export interface ListeningInterval {
  interval_id: string;
  session_id: string;
  device_id: string;
  started_at: number;
  ended_at: number;
  listened_ms: number;
  volume_percent: number | null;
  system_volume_percent: number | null;
  muted: boolean;
  playback_rate: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
}
export interface ProfileVolumeStat {
  volume_percent: number | null;
  listened_ms: number;
  muted: boolean;
}
export type PlaybackObservationKind = 'play' | 'pause' | 'resume' | 'seek' | 'skip' | 'ended' | 'error' | 'rate' | 'volume' | 'shuffle' | 'repeat';
export interface PlaybackObservation {
  event_id: string;
  session_id: string;
  track_id: number;
  device_id: string;
  at: number;
  kind: PlaybackObservationKind;
  position_ms: number;
  previous_position_ms?: number;
  playback_rate: number;
  volume_percent: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
}

export interface ProfileTotals {
  listened_ms: number;
  plays: number;
  completed: number;
  skipped: number;
  unique_tracks: number;
  unique_artists: number;
  active_days: number;
  average_session_ms: number;
  longest_session_ms: number;
  pauses: number;
  resumes: number;
  seeks: number;
  repeat_plays: number;
}

export interface ProfileTimelinePoint {
  date: string;
  listened_ms: number;
  plays: number;
}
export interface ProfileTimeBucket {
  index: number;
  listened_ms: number;
  plays: number;
}
export interface ProfileCategoryStat {
  name: string;
  listened_ms: number;
  plays: number;
  unique_tracks: number;
}
export interface ProfileTrackStat {
  identity: string;
  track_id: number | null;
  track: Track | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  duration_ms: number | null;
  listened_ms: number;
  plays: number;
  completed: number;
  skipped: number;
  first_played_at: number;
  last_played_at: number;
  volume: ProfileVolumeStat[];
  device_ids: string[];
}
export interface ProfileDetailedHistory {
  identity: string;
  session_id: string;
  started_at: number;
  ended_at: number | null;
  listened_ms: number;
  completed: boolean;
  skipped: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  track: Track | null;
  observations: PlaybackObservation[];
  device: ProfileDevice;
  intervals: ListeningInterval[];
}
export interface ProfileAnalytics {
  period: ProfilePeriod;
  from: number;
  to: number;
  available_years: number[];
  observation_started_at: number;
  totals: ProfileTotals;
  /** Measured legacy time without recorded intervals; excluded from time-of-day charts. */
  unlocated_listened_ms: number;
  previous_listened_ms: number;
  change_percent: number | null;
  timeline: ProfileTimelinePoint[];
  hours: ProfileTimeBucket[];
  weekdays: ProfileTimeBucket[];
  tracks: ProfileTrackStat[];
  artists: ProfileCategoryStat[];
  albums: ProfileCategoryStat[];
  genres: ProfileCategoryStat[];
  history: ProfileDetailedHistory[];
  devices: ProfileDevice[];
  volume: ProfileVolumeStat[];
}
