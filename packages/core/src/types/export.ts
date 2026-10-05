import type { ProfileBundle } from '../profile-bundle/types';
export interface ExportManifest {
  version: number;
  bundle_type?: 'library' | 'playlist' | 'songs' | 'profile';
  created_at: number;
  device_name: string;
  track_count: number;
  playlist_count: number;
  total_size_bytes: number;
  library_track_hashes?: string[];
  tracks: ExportTrackEntry[];
  playlists: ExportPlaylistEntry[];
  /** Only in a Profile export: settings with keys, the R2 connection, stars and listening history. */
  profile?: ProfileBundle;
}

export interface ExportTrackEntry {
  file_hash: string;
  /** Stable full-file identity used across desktop and mobile exports. */
  content_hash_sha256?: string;
  /** Original TON download completion time in Unix seconds. */
  downloaded_at?: number | null;
  relative_path: string;
  metadata: {
    title: string | null;
    artist: string | null;
    album: string | null;
    genre: string | null;
    year: number | null;
    duration_ms: number | null;
    loudness_lufs: number | null;
    loudness_gain: number | null;
  };
}

export interface ExportPlaylistEntry {
  name: string;
  description: string | null;
  cover_relative_path?: string | null;
  is_smart: boolean;
  smart_rules: string | null;
  track_hashes: string[];
}
