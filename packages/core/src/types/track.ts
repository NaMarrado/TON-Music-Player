export interface Track {
  id: number;
  file_path: string;
  file_hash: string | null;
  content_hash_sha256: string | null;
  file_size: number | null;
  file_mtime: number | null;

  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  disc_number: number | null;
  duration_ms: number | null;
  genre: string | null;
  year: number | null;
  bitrate: number | null;
  sample_rate: number | null;
  format: AudioFormat | null;
  cover_art_path: string | null;

  loudness_lufs: number | null;
  loudness_gain: number | null;

  youtube_id: string | null;
  spotify_id: string | null;
  soundcloud_id: string | null;
  source_url: string | null;

  play_count: number;
  last_played_at: number | null;
  rating: number | null;
  in_library: number;
  added_at: number;
  downloaded_at: number | null;
  scanned_at: number;
}

export type AudioFormat = 'opus' | 'mp3' | 'flac' | 'wav' | 'ogg' | 'aac' | 'm4a' | 'webm';

export interface TrackMetadata {
  title: string;
  artist: string;
  album?: string;
  album_artist?: string;
  track_number?: number;
  disc_number?: number;
  duration_ms?: number;
  genre?: string;
  year?: number;
  cover_art_url?: string;
}
