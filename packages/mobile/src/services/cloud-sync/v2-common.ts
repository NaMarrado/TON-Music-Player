import type {
  CloudLibraryManifestV1,
  CloudLibraryManifestV2,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudSyncOrigin,
  CloudSyncProgress,
  CloudSyncResult,
  CloudTrackEntry,
  CloudTrackRecordV2,
  CloudPlaylistRecordV2,
} from '@ton/core';
import {
  buildCloudManifestObjectKey,
  buildCloudV2ActivationObjectKey,
  buildLegacyCloudManifestObjectKey,
} from '@ton/core';
import { MobileR2Client, MobileR2PreconditionFailedError } from './r2-client';

export type MobileCloudSyncMode = 'upload' | 'fetch' | 'sync';

export interface MobileCloudV2SyncOptions {
  config: CloudStorageConfig;
  mode: MobileCloudSyncMode;
  origin: CloudSyncOrigin;
  allowAudioDownloads: boolean;
  onProgress?: (progress: CloudSyncProgress) => void;
  signal?: AbortSignal;
}

export interface PreparedLocalManifest {
  manifest: CloudLibraryManifestV2;
  uploads: Map<string, { filePath: string; contentType: string; hash: string }>;
  trackEntryByLocalId: Map<number, CloudTrackEntry>;
  playlistEntryByLocalId: Map<number, CloudPlaylistEntry>;
  incremental: boolean;
}

export const EMPTY_RESULT: CloudSyncResult = {
  uploaded: 0, downloaded: 0, skipped: 0, failed: 0,
  importedTracks: 0, importedPlaylists: 0, revision: null,
};

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('cloud_sync_cancelled');
}

export function emitProgress(
  callback: MobileCloudV2SyncOptions['onProgress'],
  patch: Partial<CloudSyncProgress>,
): void {
  callback?.({
    phase: 'idle', current: 0, total: 0, uploaded: 0,
    downloaded: 0, skipped: 0, failed: 0, ...patch,
  });
}

function parseManifestV1(value: unknown): CloudLibraryManifestV1 | null {
  if (!value || typeof value !== 'object') return null;
  const manifest = value as Partial<CloudLibraryManifestV1>;
  return manifest.schema_version === 1 && manifest.app === 'TON'
    ? manifest as CloudLibraryManifestV1
    : null;
}

export function projectManifestV2ToV1(manifest: CloudLibraryManifestV2): CloudLibraryManifestV1 {
  const tracks = manifest.tracks
    .filter((record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted)
    .map((record) => record.entry);
  return {
    schema_version: 1,
    app: 'TON',
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
    device_id: manifest.writer_device_id,
    revision: manifest.revision,
    library_track_hashes: tracks.map((track) => track.content_hash_sha256),
    tracks,
    playlists: manifest.playlists
      .filter((record): record is Extract<CloudPlaylistRecordV2, { deleted: false }> => !record.deleted)
      .map((record) => record.entry),
  };
}

export async function readBootstrapManifestV1(
  client: MobileR2Client,
  config: CloudStorageConfig,
  signal?: AbortSignal,
): Promise<CloudLibraryManifestV1 | null> {
  const current = parseManifestV1(await client.getJson<CloudLibraryManifestV1>(
    buildCloudManifestObjectKey(config.prefix), signal,
  ));
  return current ?? parseManifestV1(await client.getJson<CloudLibraryManifestV1>(
    buildLegacyCloudManifestObjectKey(config.prefix), signal,
  ));
}

export async function ensureV2ActivationMarker(
  client: MobileR2Client,
  config: CloudStorageConfig,
  deviceId: string,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await client.putJsonConditional(
      buildCloudV2ActivationObjectKey(config.prefix),
      { schema_version: 2, activated_at: Date.now(), device_id: deviceId },
      { ifNoneMatch: '*', signal },
    );
  } catch (error) {
    if (!(error instanceof MobileR2PreconditionFailedError)) throw error;
  }
}

export function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}
