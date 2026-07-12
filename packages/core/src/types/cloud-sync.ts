import type { AudioFormat } from './track';

export type CloudStorageJurisdiction = 'default' | 'eu' | 'fedramp';

export interface CloudStorageConfig {
  accountId: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction: CloudStorageJurisdiction;
}

export type CloudStoragePublicConfig = Omit<CloudStorageConfig, 'secretAccessKey'> & {
  hasSecretAccessKey: boolean;
};

export interface CloudTrackMetadata {
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
  loudness_lufs: number | null;
  loudness_gain: number | null;
  rating: number | null;
}

export interface CloudTrackEntry {
  content_hash_sha256: string;
  object_key: string;
  file_name: string;
  file_size: number | null;
  format: AudioFormat | null;
  artwork_hash_sha256: string | null;
  artwork_object_key: string | null;
  artwork_file_name: string | null;
  youtube_id: string | null;
  spotify_id: string | null;
  soundcloud_id: string | null;
  source_url: string | null;
  added_at: number;
  updated_at: number;
  metadata: CloudTrackMetadata;
}

export interface CloudPlaylistEntry {
  cloud_id: string;
  name: string;
  description: string | null;
  cover_hash_sha256: string | null;
  cover_object_key: string | null;
  is_smart: boolean;
  smart_rules: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  track_hashes: string[];
}

export interface CloudLibraryManifestV1 {
  schema_version: 1;
  app: 'TON';
  created_at: number;
  updated_at: number;
  device_id: string;
  revision: string;
  library_track_hashes: string[];
  tracks: CloudTrackEntry[];
  playlists: CloudPlaylistEntry[];
}

export type CloudSyncPhase =
  | 'idle'
  | 'testing'
  | 'hashing'
  | 'reading-manifest'
  | 'uploading'
  | 'downloading'
  | 'writing-manifest'
  | 'importing'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface CloudSyncProgress {
  phase: CloudSyncPhase;
  current: number;
  total: number;
  uploaded: number;
  downloaded: number;
  skipped: number;
  failed: number;
  message?: string;
}

export interface CloudSyncResult {
  uploaded: number;
  downloaded: number;
  skipped: number;
  failed: number;
  importedTracks: number;
  importedPlaylists: number;
  revision: string | null;
}
