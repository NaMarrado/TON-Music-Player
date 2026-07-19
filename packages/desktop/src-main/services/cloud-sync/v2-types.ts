import type { CloudPlaylistEntry, CloudTrackEntry } from '@ton/core';
import type {
  CancelSignal,
  LocalCloudArtwork,
  LocalCloudTrack,
  ProgressCallback,
} from './sync-common';

export type DesktopCloudV2SyncMode = 'upload' | 'fetch' | 'sync';

export type V2SyncOptions = {
  onProgress?: ProgressCallback;
  shouldCancel?: CancelSignal;
  signal?: AbortSignal;
  force?: boolean;
  mode?: DesktopCloudV2SyncMode;
  restoreLocallyDeleted?: boolean;
  onMetadataApplied?: () => void;
  onTracksApplied?: (trackIds: number[]) => void;
};

export function shouldAcknowledgeDesktopCloudOutbox(
  mode: DesktopCloudV2SyncMode,
): boolean {
  return mode !== 'fetch';
}

export type SerializedTrack = {
  local: LocalCloudTrack;
  entry: CloudTrackEntry;
};

export type SerializedPlaylist = {
  localId: number;
  entry: CloudPlaylistEntry;
  cover: LocalCloudArtwork | null;
};

export type CloudMirrorRow = {
  entity_type: 'track' | 'playlist';
  entity_key: string;
  record_json: string;
};

export function throwIfV2Cancelled(options: V2SyncOptions): void {
  if (options.shouldCancel?.() || options.signal?.aborted) {
    throw new Error('cloud_sync_cancelled');
  }
}
