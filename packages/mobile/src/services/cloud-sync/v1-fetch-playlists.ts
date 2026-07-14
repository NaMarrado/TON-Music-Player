import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { getMobileCloudProtectedEntities, withMobileCloudOutboxSuppressed } from './local-state';
import { getFileExtension } from './media';
import { MobileR2Client } from './r2-client';
import {
  ARTWORK_DIR,
  downloadVerifiedCloudFile,
  fileExists,
  throwIfCancelled,
  type CancelSignal,
  type CloudFetchApplyProtection,
} from './v1-common';

export async function fetchV1Playlists(input: {
  client: MobileR2Client;
  manifest: CloudLibraryManifestV1;
  trackIdByHash: Map<string, number>;
  result: CloudSyncResult;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
}): Promise<void> {
  const {
    client, manifest, trackIdByHash, result,
    shouldCancel, abortSignal, applyProtection,
  } = input;
  const coverPaths = new Map<string, string | null>();
  for (const playlist of manifest.playlists) {
    throwIfCancelled(shouldCancel);
    let coverPath: string | null = null;
    if (playlist.cover_object_key && playlist.cover_hash_sha256) {
      const coverExt = getFileExtension(playlist.cover_object_key, null);
      coverPath = `${ARTWORK_DIR}${playlist.cover_hash_sha256}${coverExt}`;
      if (!(await fileExists(coverPath))) {
        await downloadVerifiedCloudFile(
          client, playlist.cover_object_key, coverPath,
          playlist.cover_hash_sha256, abortSignal,
        );
      }
    }
    coverPaths.set(playlist.cloud_id, coverPath);
  }
  throwIfCancelled(shouldCancel);
  await withMobileCloudOutboxSuppressed(async (db) => {
    const protectedEntities = applyProtection
      ? await getMobileCloudProtectedEntities(
        applyProtection.scopeId, applyProtection.afterGeneration, db,
      )
      : null;
    for (const playlist of manifest.playlists) {
      throwIfCancelled(shouldCancel);
      if (protectedEntities?.playlistCloudIds.has(playlist.cloud_id)) continue;
      await db.runAsync(
        `INSERT INTO playlists (
          cloud_id, name, description, cover_path, is_smart, smart_rules,
          sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cloud_id) DO UPDATE SET
          name = excluded.name, description = excluded.description,
          cover_path = excluded.cover_path, is_smart = excluded.is_smart,
          smart_rules = excluded.smart_rules, sort_order = excluded.sort_order,
          updated_at = excluded.updated_at`,
        [
          playlist.cloud_id, playlist.name, playlist.description,
          coverPaths.get(playlist.cloud_id) ?? null, playlist.is_smart ? 1 : 0,
          playlist.smart_rules, playlist.sort_order,
          playlist.created_at, playlist.updated_at,
        ],
      );
      const row = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM playlists WHERE cloud_id = ?', [playlist.cloud_id],
      );
      if (!row) continue;
      await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [row.id]);
      let position = 0;
      for (const hash of playlist.track_hashes) {
        const trackId = trackIdByHash.get(hash);
        if (!trackId) continue;
        await db.runAsync(
          'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
          [row.id, trackId, position++],
        );
      }
      result.importedPlaylists += 1;
    }
  });
}
