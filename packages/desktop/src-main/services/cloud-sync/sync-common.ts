import fs from 'node:fs';
import path from 'node:path';
import type {
  CloudStorageConfig,
  CloudSyncProgress,
  CloudSyncResult,
  CloudTrackEntry,
  Track,
} from '@ton/core';
import { sanitizeFilename } from '@ton/core';
import { getDesktopCloudConfig } from './config';
import { extensionForTrack } from './media';

export type ProgressCallback = (progress: CloudSyncProgress) => void;
export type CancelSignal = () => boolean;

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
    phase: 'idle',
    current: 0,
    total: 0,
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    ...patch,
  });
}

export function throwIfCancelled(shouldCancel?: CancelSignal): void {
  if (shouldCancel?.()) {
    throw new Error('cloud_sync_cancelled');
  }
}

export function requireConfig(): CloudStorageConfig {
  const config = getDesktopCloudConfig();
  if (!config) {
    throw new Error('Cloudflare R2 is not configured');
  }
  return config;
}

export async function pathExists(filePath: string | null | undefined): Promise<boolean> {
  if (!filePath) {
    return false;
  }
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function buildImportedFileName(track: CloudTrackEntry): string {
  const ext = path.extname(track.file_name) || extensionForTrack(track.file_name, track.format);
  const title = track.metadata.title || 'Unknown Track';
  const artist = track.metadata.artist || 'Unknown Artist';
  return `${sanitizeFilename(`${artist} - ${title}`) || 'Track'}_${track.content_hash_sha256.slice(0, 8)}${ext}`;
}

export function normalizeDownloadedAt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}
