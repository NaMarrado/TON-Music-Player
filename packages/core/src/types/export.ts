export interface ExportManifest {
  version: number;
  bundle_type?: 'library' | 'playlist';
  created_at: number;
  device_name: string;
  track_count: number;
  playlist_count: number;
  total_size_bytes: number;
  library_track_hashes?: string[];
  tracks: ExportTrackEntry[];
  playlists: ExportPlaylistEntry[];
}

export interface ExportTrackEntry {
  file_hash: string;
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
