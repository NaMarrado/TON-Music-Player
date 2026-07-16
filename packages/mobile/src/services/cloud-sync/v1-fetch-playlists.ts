import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { getDb } from '../database';
import { getMobileCloudProtectedEntities, withMobileCloudOutboxSuppressed } from './local-state';
import { getFileExtension } from './media';
import { MobileR2Client } from './r2-client';
import { resolveAvailablePlaylistTrackIds } from './playlist-memberships';
import {
  ARTWORK_DIR,
  downloadVerifiedCloudFile,
  fileExists,
  emitProgress,
  throwIfCancelled,
  type CancelSignal,
  type CloudFetchApplyProtection,
  type ProgressCallback,
} from './v1-common';

export async function fetchV1Playlists(input: {
  client: MobileR2Client;
  manifest: CloudLibraryManifestV1;
  trackIdByHash: Map<string, number>;
  result: CloudSyncResult;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
  onProgress?: ProgressCallback;
}): Promise<void> {
  const {
    client, manifest, trackIdByHash, result,
    shouldCancel, abortSignal, applyProtection, onProgress,
  } = input;
  const coverPaths = new Map<string, string | null>();
  const existingPlaylists = await getDb().getAllAsync<{
    cloud_id: string; cover_path: string | null;
  }>(
    `SELECT cloud_id, cover_path FROM playlists
     WHERE cloud_id IS NOT NULL AND cloud_id != ''`,
  );
  const existingCoverByCloudId = new Map(
    existingPlaylists.map((playlist) => [playlist.cloud_id, playlist.cover_path]),
  );
  for (const playlist of manifest.playlists) {
    throwIfCancelled(shouldCancel);
    let coverPath = existingCoverByCloudId.get(playlist.cloud_id) ?? null;
    if (playlist.cover_object_key && playlist.cover_hash_sha256) {
      const coverExt = getFileExtension(playlist.cover_object_key, null);
      const requestedCoverPath = `${ARTWORK_DIR}${playlist.cover_hash_sha256}${coverExt}`;
      if (!(await fileExists(coverPath)) && !(await fileExists(requestedCoverPath))) {
        try {
          await downloadVerifiedCloudFile(
            client, playlist.cover_object_key, requestedCoverPath,
            playlist.cover_hash_sha256, abortSignal,
          );
          coverPath = requestedCoverPath;
        } catch (error) {
          if (abortSignal?.aborted || shouldCancel?.()) throw error;
          result.failed += 1;
        }
      } else if (await fileExists(requestedCoverPath)) {
        coverPath = requestedCoverPath;
      }
    } else {
      coverPath = null;
    }
    coverPaths.set(playlist.cloud_id, coverPath);
  }
  throwIfCancelled(shouldCancel);
  for (let index = 0; index < manifest.playlists.length; index += 1) {
    const playlist = manifest.playlists[index];
    throwIfCancelled(shouldCancel);
    try {
      const applied = await withMobileCloudOutboxSuppressed(async (db) => {
        const protectedEntities = applyProtection
          ? await getMobileCloudProtectedEntities(
            applyProtection.scopeId, applyProtection.afterGeneration, db,
          )
          : null;
        if (protectedEntities?.playlistCloudIds.has(playlist.cloud_id)) return false;
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
        if (!row) return false;
        await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [row.id]);
        const trackIds = resolveAvailablePlaylistTrackIds(
          playlist.track_hashes, trackIdByHash,
        );
        for (let position = 0; position < trackIds.length; position += 1) {
          await db.runAsync(
            'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
            [row.id, trackIds[position], position],
          );
        }
        return true;
      });
      if (applied) result.importedPlaylists += 1;
      else result.skipped += 1;
    } catch (error) {
      if (abortSignal?.aborted || shouldCancel?.()) throw error;
      result.failed += 1;
    } finally {
      emitProgress(onProgress, {
        phase: 'importing', current: index + 1, total: manifest.playlists.length,
        downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
        message: playlist.name,
      });
    }
  }
}
