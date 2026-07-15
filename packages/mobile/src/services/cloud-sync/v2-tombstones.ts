import * as FileSystem from 'expo-file-system';
import type { CloudLibraryManifestV2, CloudPlaylistRecordV2, CloudTrackRecordV2 } from '@ton/core';
import { MUSIC_DIR } from '../downloader/filesystem';
import {
  getMobileCloudProtectedEntities,
  withMobileCloudOutboxSuppressed,
  type MobileCloudProtectedEntities,
} from './local-state';
import { throwIfAborted } from './v2-common';

export interface ApplyProtection {
  scopeId: string;
  afterGeneration: number;
}

export function omitProtectedManifestEntities(
  manifest: CloudLibraryManifestV2,
  protectedEntities: MobileCloudProtectedEntities,
): CloudLibraryManifestV2 {
  return {
    ...manifest,
    tracks: manifest.tracks.filter(
      (record) => !protectedEntities.trackHashes.has(record.content_hash_sha256),
    ),
    playlists: manifest.playlists.filter(
      (record) => !protectedEntities.playlistCloudIds.has(record.cloud_id),
    ),
  };
}

export async function applyTombstones(
  manifest: CloudLibraryManifestV2,
  protection?: ApplyProtection,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const trackHashes = manifest.tracks
    .filter((record): record is Extract<CloudTrackRecordV2, { deleted: true }> => record.deleted)
    .map((record) => record.content_hash_sha256);
  const playlistIds = manifest.playlists
    .filter((record): record is Extract<CloudPlaylistRecordV2, { deleted: true }> => record.deleted)
    .map((record) => record.cloud_id);
  const pathsToDelete: string[] = [];
  await withMobileCloudOutboxSuppressed(async (db) => {
    const protectedEntities = protection
      ? await getMobileCloudProtectedEntities(
        protection.scopeId, protection.afterGeneration, db,
      )
      : null;
    for (const hash of trackHashes) {
      throwIfAborted(signal);
      if (protectedEntities?.trackHashes.has(hash)) continue;
      const rows = await db.getAllAsync<{ id: number; file_path: string }>(
        'SELECT id, file_path FROM tracks WHERE content_hash_sha256 = ?', [hash],
      );
      for (const row of rows) {
        if (row.file_path.startsWith(MUSIC_DIR)) pathsToDelete.push(row.file_path);
        await db.runAsync('DELETE FROM tracks WHERE id = ?', [row.id]);
      }
    }
    for (const cloudId of playlistIds) {
      throwIfAborted(signal);
      if (!protectedEntities?.playlistCloudIds.has(cloudId)) {
        await db.runAsync('DELETE FROM playlists WHERE cloud_id = ?', [cloudId]);
      }
    }
  });
  throwIfAborted(signal);
  await Promise.all(pathsToDelete.map((path) => (
    FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)
  )));
  throwIfAborted(signal);
}
