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
  /** Original TON download completion time in Unix seconds. */
  downloaded_at?: number | null;
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

/**
 * Deterministic last-writer-wins version used by the V2 cloud manifest.
 *
 * `counter` is a Lamport clock. A device must advance it beyond every version
 * it has observed before publishing a local mutation. `device_id` breaks ties
 * when two offline devices independently choose the same counter.
 */
export interface CloudEntityVersionV2 {
  counter: number;
  device_id: string;
}

interface CloudRecordV2Base {
  version: CloudEntityVersionV2;
}

export interface CloudLiveTrackRecordV2 extends CloudRecordV2Base {
  content_hash_sha256: string;
  deleted: false;
  entry: CloudTrackEntry;
}

export interface CloudDeletedTrackRecordV2 extends CloudRecordV2Base {
  content_hash_sha256: string;
  deleted: true;
  deleted_at: number;
}

export type CloudTrackRecordV2 = CloudLiveTrackRecordV2 | CloudDeletedTrackRecordV2;

export interface CloudLivePlaylistRecordV2 extends CloudRecordV2Base {
  cloud_id: string;
  deleted: false;
  entry: CloudPlaylistEntry;
}

export interface CloudDeletedPlaylistRecordV2 extends CloudRecordV2Base {
  cloud_id: string;
  deleted: true;
  deleted_at: number;
}

export type CloudPlaylistRecordV2 =
  | CloudLivePlaylistRecordV2
  | CloudDeletedPlaylistRecordV2;

/**
 * Conflict-safe cloud manifest. The current V1 object remains readable during
 * bootstrap, while all automatic synchronization is published under the V2
 * key so an older client cannot erase tombstones it does not understand.
 */
export interface CloudLibraryManifestV2 {
  schema_version: 2;
  app: 'TON';
  created_at: number;
  updated_at: number;
  writer_device_id: string;
  revision: string;
  max_counter: number;
  tracks: CloudTrackRecordV2[];
  playlists: CloudPlaylistRecordV2[];
}

export type CloudSyncOrigin = 'auto' | 'manual' | 'background';

export type CloudAutoSyncState =
  | 'disabled'
  | 'unconfigured'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'waiting-for-wifi'
  | 'backing-off'
  | 'error';

export interface CloudAutoSyncStatus {
  enabled: boolean;
  configured: boolean;
  state: CloudAutoSyncState;
  pendingChanges: number;
  pendingDownloads: number;
  lastSuccessAt: number | null;
  lastErrorKey: string | null;
  nextRetryAt: number | null;
  /** Ephemeral current/last run progress. It is never persisted. */
  progress?: CloudSyncProgress | null;
}

export type CloudConditionalJsonReadResult<T> =
  | { status: 'ok'; value: T; etag: string }
  | { status: 'not-modified'; etag: string | null }
  | { status: 'missing'; etag: null };

/** Minimal cross-runtime shape accepted by desktop and React Native signals. */
export interface CloudAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export interface CloudConditionalReadOptions {
  ifNoneMatch?: string | null;
  signal?: CloudAbortSignal;
}

export interface CloudConditionalWriteOptions {
  ifMatch?: string | null;
  ifNoneMatch?: '*';
  signal?: CloudAbortSignal;
}

export type CloudConditionalWriteResult =
  | { status: 'ok'; etag: string | null }
  | { status: 'precondition-failed'; etag: string | null };

export type CloudSyncPhase =
  | 'idle'
  | 'testing'
  | 'hashing'
  | 'reading-manifest'
  | 'uploading'
  | 'downloading'
  | 'writing-manifest'
  | 'importing'
  | 'analyzing-cleanup'
  | 'cleaning'
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
  restoredLocallyDeleted?: number;
}

export interface CloudLocalDeletionPreview {
  deletedTracks: number;
  reclaimableBytes: number;
}

export interface CloudR2ObjectInfo {
  key: string;
  size: number;
}

export interface CloudR2CleanupTrackSummary {
  contentHash: string;
  title: string | null;
  artist: string | null;
  objectKey: string;
  size: number;
}

export interface CloudR2CleanupPlaylistSummary {
  cloudId: string;
  name: string;
  removedTracks: number;
  remainingTracks: number;
}

export interface CloudR2CleanupFailureSummary {
  contentHash: string;
  errorMessage: string;
  failedAt: number;
}

export interface CloudR2CleanupPreview {
  previewToken: string;
  localTracks: number;
  cloudTracks: number;
  cloudOnlyTracks: number;
  affectedPlaylists: number;
  objectsToDelete: number;
  reclaimableBytes: number;
  tracks: CloudR2CleanupTrackSummary[];
  playlists: CloudR2CleanupPlaylistSummary[];
  failuresToClear: CloudR2CleanupFailureSummary[];
}

export interface CloudR2CleanupResult {
  status: 'completed' | 'stale';
  deletedTracks: number;
  updatedPlaylists: number;
  deletedObjects: number;
  failedObjects: number;
  freedBytes: number;
  revision: string | null;
  refreshedPreview?: CloudR2CleanupPreview;
}
