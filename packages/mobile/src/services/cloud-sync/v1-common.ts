import * as FileSystem from 'expo-file-system';
import type {
  AudioFormat,
  CloudStorageConfig,
  CloudSyncProgress,
  CloudSyncResult,
  CloudTrackEntry,
  Track,
} from '@ton/core';
import { sanitizeFilename } from '@ton/core';
import { updateTrack } from '../db-queries';
import { ensureArtworkDir } from '../cover-art';
import { getMobileCloudConfig } from './config';
import { hashFileSha256 } from './hash';
import { getFileExtension } from './media';
import { withMobileCloudOutboxSuppressed } from './local-state';
import { MobileR2Client } from './r2-client';

export type ProgressCallback = (progress: CloudSyncProgress) => void;
export type CancelSignal = () => boolean;

export interface CloudFetchApplyProtection {
  scopeId: string;
  afterGeneration: number;
}

export type LocalCloudTrack = {
  track: Track;
  contentHash: string;
  audioObjectKey: string;
  artworkHash: string | null;
  artworkObjectKey: string | null;
  artworkPath: string | null;
};

export type LocalCloudArtwork = {
  key: string;
  filePath: string;
  hash: string;
  contentType: string;
};

export const ARTWORK_DIR = `${FileSystem.documentDirectory}artwork/`;
export const EMPTY_RESULT: CloudSyncResult = {
  uploaded: 0,
  downloaded: 0,
  skipped: 0,
  failed: 0,
  importedTracks: 0,
  importedPlaylists: 0,
  revision: null,
};

export function emitProgress(
  onProgress: ProgressCallback | undefined,
  patch: Partial<CloudSyncProgress>,
): void {
  onProgress?.({
    phase: 'idle', current: 0, total: 0, uploaded: 0,
    downloaded: 0, skipped: 0, failed: 0, ...patch,
  });
}

export function throwIfCancelled(shouldCancel?: CancelSignal): void {
  if (shouldCancel?.()) throw new Error('cloud_sync_cancelled');
}

export async function requireConfig(): Promise<CloudStorageConfig> {
  const config = await getMobileCloudConfig();
  if (!config) throw new Error('Cloudflare R2 is not configured');
  return config;
}

export async function fileExists(fileUri: string | null | undefined): Promise<boolean> {
  if (!fileUri) return false;
  return (await FileSystem.getInfoAsync(fileUri)).exists;
}

export async function downloadVerifiedCloudFile(
  client: MobileR2Client,
  objectKey: string,
  destinationUri: string,
  expectedHash: string,
  signal?: AbortSignal,
): Promise<void> {
  const separator = destinationUri.lastIndexOf('/');
  if (separator >= 0) {
    await FileSystem.makeDirectoryAsync(destinationUri.slice(0, separator + 1), {
      intermediates: true,
    });
  }
  // A stable staging path lets iOS reattach to the same background URLSession
  // task after suspension or process relaunch.
  const temporaryUri = `${destinationUri}.r2-part`;
  let downloadedUri: string | null = null;
  try {
    downloadedUri = await client.downloadFile(objectKey, temporaryUri, signal);
    const downloadedInfo = await FileSystem.getInfoAsync(downloadedUri);
    if (!downloadedInfo.exists) {
      throw new Error('cloud_sync_downloaded_file_missing');
    }
    const actualHash = await hashFileSha256(downloadedUri);
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error('cloud_sync_hash_mismatch');
    }
    const destinationInfo = await FileSystem.getInfoAsync(destinationUri);
    if (destinationInfo.exists) {
      const destinationHash = await hashFileSha256(destinationUri);
      if (destinationHash.toLowerCase() === expectedHash.toLowerCase()) {
        return;
      }
      await FileSystem.deleteAsync(destinationUri, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: downloadedUri, to: destinationUri });
  } finally {
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
    if (downloadedUri && downloadedUri !== temporaryUri) {
      await FileSystem.deleteAsync(downloadedUri, { idempotent: true }).catch(() => {});
    }
  }
}

export function buildImportedFileName(track: CloudTrackEntry): string {
  const ext = getFileExtension(track.file_name, track.format);
  const title = track.metadata.title || 'Unknown Track';
  const artist = track.metadata.artist || 'Unknown Artist';
  return `${sanitizeFilename(`${artist} - ${title}`) || 'Track'}_${track.content_hash_sha256.slice(0, 8)}${ext}`;
}

export function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

export async function normalizeCloudAudioForPlayback(
  filePath: string,
  format: AudioFormat | null,
): Promise<{ filePath: string; format: AudioFormat | null }> {
  return { filePath, format };
}

export async function ensureTrackContentHash(track: Track): Promise<string | null> {
  if (!(await fileExists(track.file_path))) return null;
  if (track.content_hash_sha256) return track.content_hash_sha256;
  const contentHash = await hashFileSha256(track.file_path);
  await withMobileCloudOutboxSuppressed((db) => (
    updateTrack(track.id, { content_hash_sha256: contentHash }, db)
  ));
  return contentHash;
}

export async function ensurePlaylistCloudId(id: number, existing: string | null): Promise<string> {
  if (existing) return existing;
  const cloudId = `playlist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await withMobileCloudOutboxSuppressed(async (db) => {
    await db.runAsync('UPDATE playlists SET cloud_id = ? WHERE id = ?', [cloudId, id]);
  });
  return cloudId;
}

export async function ensureMobileCloudDirectories(): Promise<void> {
  await ensureArtworkDir();
}
