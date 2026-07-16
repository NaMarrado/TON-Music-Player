import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { getDb } from '../database';
import { refreshPlaylistsById } from '../../stores/playlist-store';
import {
  getMobileCloudProtectedEntities,
  withMobileCloudOutboxSuppressed,
} from './local-state';
import { getFileExtension } from './media';
import { MobileR2Client } from './r2-client';
import {
  ARTWORK_DIR,
  downloadVerifiedCloudFile,
  emitProgress,
  fileExists,
  throwIfCancelled,
  type CancelSignal,
  type CloudFetchApplyProtection,
  type ProgressCallback,
} from './v1-common';

type PlaylistMembershipTarget = {
  cloudId: string;
  playlistId: number;
  position: number;
};

export type PreparedV1Playlists = {
  applyProtection?: CloudFetchApplyProtection;
  membershipTargetsByHash: Map<string, PlaylistMembershipTarget[]>;
  playlistIdByCloudId: Map<string, number>;
};

const MEMBERSHIP_INSERT_BATCH_SIZE = 250;

export async function prepareV1PlaylistShells(input: {
  manifest: CloudLibraryManifestV1;
  result: CloudSyncResult;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
  onProgress?: ProgressCallback;
}): Promise<PreparedV1Playlists> {
  const {
    manifest, result, shouldCancel, abortSignal, applyProtection, onProgress,
  } = input;
  throwIfFetchCancelled(shouldCancel, abortSignal);
  const [existingPlaylists, existingTracks, protectedEntities] = await Promise.all([
    getDb().getAllAsync<{ cloud_id: string; cover_path: string | null }>(
      `SELECT cloud_id, cover_path FROM playlists
       WHERE cloud_id IS NOT NULL AND cloud_id != ''`,
    ),
    getDb().getAllAsync<{ id: number; content_hash_sha256: string }>(
      `SELECT id, content_hash_sha256 FROM tracks
       WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''`,
    ),
    applyProtection
      ? getMobileCloudProtectedEntities(
        applyProtection.scopeId,
        applyProtection.afterGeneration,
      )
      : null,
  ]);
  const existingCoverByCloudId = new Map(
    existingPlaylists.map((playlist) => [playlist.cloud_id, playlist.cover_path]),
  );
  const existingTrackIdByHash = new Map(
    existingTracks.map((track) => [track.content_hash_sha256, track.id]),
  );
  const playlistIdByCloudId = new Map<string, number>();
  const membershipTargetsByHash = new Map<string, PlaylistMembershipTarget[]>();

  emitProgress(onProgress, { phase: 'importing', total: manifest.playlists.length });
  await withMobileCloudOutboxSuppressed(async (db) => {
    for (let index = 0; index < manifest.playlists.length; index += 1) {
      throwIfFetchCancelled(shouldCancel, abortSignal);
      const playlist = manifest.playlists[index];
      if (protectedEntities?.playlistCloudIds.has(playlist.cloud_id)) {
        result.skipped += 1;
        continue;
      }
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
          playlist.cover_hash_sha256
            ? existingCoverByCloudId.get(playlist.cloud_id) ?? null
            : null,
          playlist.is_smart ? 1 : 0, playlist.smart_rules, playlist.sort_order,
          playlist.created_at, playlist.updated_at,
        ],
      );
      const row = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM playlists WHERE cloud_id = ?',
        [playlist.cloud_id],
      );
      if (!row) {
        result.failed += 1;
        continue;
      }
      playlistIdByCloudId.set(playlist.cloud_id, row.id);
      await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [row.id]);

      const existingMemberships: Array<[number, number, number]> = [];
      playlist.track_hashes.forEach((hash, position) => {
        const targets = membershipTargetsByHash.get(hash) ?? [];
        targets.push({ cloudId: playlist.cloud_id, playlistId: row.id, position });
        membershipTargetsByHash.set(hash, targets);
        const trackId = existingTrackIdByHash.get(hash);
        if (trackId != null) existingMemberships.push([row.id, trackId, position]);
      });
      await insertMembershipRows(db, existingMemberships);
      result.importedPlaylists += 1;
      emitProgress(onProgress, {
        phase: 'importing', current: index + 1, total: manifest.playlists.length,
        downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
        message: playlist.name,
      });
    }
  });

  return { applyProtection, membershipTargetsByHash, playlistIdByCloudId };
}

export async function downloadV1PlaylistCovers(input: {
  client: MobileR2Client;
  manifest: CloudLibraryManifestV1;
  prepared: PreparedV1Playlists;
  result: CloudSyncResult;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { client, manifest, prepared, result, shouldCancel, abortSignal } = input;
  const changedPlaylistIds: number[] = [];
  for (const playlist of manifest.playlists) {
    throwIfFetchCancelled(shouldCancel, abortSignal);
    if (!playlist.cover_object_key || !playlist.cover_hash_sha256) continue;
    const playlistId = prepared.playlistIdByCloudId.get(playlist.cloud_id);
    if (playlistId == null) continue;
    const coverExt = getFileExtension(playlist.cover_object_key, null);
    const requestedCoverPath = `${ARTWORK_DIR}${playlist.cover_hash_sha256}${coverExt}`;
    try {
      if (!(await fileExists(requestedCoverPath))) {
        await downloadVerifiedCloudFile(
          client,
          playlist.cover_object_key,
          requestedCoverPath,
          playlist.cover_hash_sha256,
          abortSignal,
        );
      }
      const applied = await withMobileCloudOutboxSuppressed(async (db) => {
        if (prepared.applyProtection) {
          const protectedEntities = await getMobileCloudProtectedEntities(
            prepared.applyProtection.scopeId,
            prepared.applyProtection.afterGeneration,
            db,
          );
          if (protectedEntities.playlistCloudIds.has(playlist.cloud_id)) return false;
        }
        await db.runAsync('UPDATE playlists SET cover_path = ? WHERE id = ?', [requestedCoverPath, playlistId]);
        return true;
      });
      if (applied) changedPlaylistIds.push(playlistId);
    } catch (error) {
      if (abortSignal?.aborted || shouldCancel?.()) throw error;
      result.failed += 1;
    }
  }
  if (changedPlaylistIds.length > 0) {
    await refreshPlaylistsById(changedPlaylistIds);
  }
}

export async function addAvailableTrackToV1Playlists(input: {
  prepared: PreparedV1Playlists;
  contentHash: string;
  trackId: number;
}): Promise<number[]> {
  const { prepared, contentHash, trackId } = input;
  const targets = prepared.membershipTargetsByHash.get(contentHash) ?? [];
  if (targets.length === 0) return [];
  const protectedEntities = prepared.applyProtection
    ? await getMobileCloudProtectedEntities(
      prepared.applyProtection.scopeId,
      prepared.applyProtection.afterGeneration,
    )
    : null;
  const allowed = targets.filter(
    (target) => !protectedEntities?.playlistCloudIds.has(target.cloudId),
  );
  if (allowed.length === 0) return [];
  await withMobileCloudOutboxSuppressed(async (db) => {
    for (const target of allowed) {
      await db.runAsync(
        `INSERT INTO playlist_tracks(playlist_id, track_id, position)
         SELECT ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND position = ?
         )`,
        [target.playlistId, trackId, target.position, target.playlistId, target.position],
      );
    }
  });
  return [...new Set(allowed.map((target) => target.playlistId))];
}

async function insertMembershipRows(
  db: Parameters<Parameters<typeof withMobileCloudOutboxSuppressed>[0]>[0],
  rows: Array<[number, number, number]>,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += MEMBERSHIP_INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + MEMBERSHIP_INSERT_BATCH_SIZE);
    if (batch.length === 0) continue;
    const values = batch.map(() => '(?, ?, ?)').join(', ');
    await db.runAsync(
      `INSERT INTO playlist_tracks(playlist_id, track_id, position) VALUES ${values}`,
      batch.flat(),
    );
  }
}

function throwIfFetchCancelled(
  shouldCancel?: CancelSignal,
  abortSignal?: AbortSignal,
): void {
  if (abortSignal?.aborted) throw new Error('cloud_sync_cancelled');
  throwIfCancelled(shouldCancel);
}
