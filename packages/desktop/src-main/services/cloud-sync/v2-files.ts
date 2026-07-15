import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CloudLibraryManifestV2, CloudStorageConfig } from '@ton/core';
import {
  buildCloudV2ActivationObjectKey,
  normalizeCloudPrefix,
} from '@ton/core';
import { getDb } from '../database';
import { getLibraryDir } from '../library-paths';
import { readDesktopCloudSyncState, updateDesktopCloudSyncState } from './auto-sync-store';
import { hashFileSha256 } from './hash';
import { DesktopR2Client } from './r2-client';

export async function downloadVerifiedCloudFile(
  client: DesktopR2Client,
  objectKey: string,
  destinationPath: string,
  expectedHash: string,
  signal?: AbortSignal,
): Promise<void> {
  const temporaryPath = `${destinationPath}.part-${randomUUID()}`;
  try {
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    await client.downloadFile(objectKey, temporaryPath, signal);
    const actualHash = await hashFileSha256(temporaryPath);
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error(`Cloud object hash mismatch for ${objectKey}`);
    }
    await fs.promises.rename(temporaryPath, destinationPath);
  } finally {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export async function cleanupOldV2CommitsIfDue(
  client: DesktopR2Client,
  config: CloudStorageConfig,
  scopeId: string,
  signal?: AbortSignal,
): Promise<void> {
  const state = readDesktopCloudSyncState(scopeId);
  const now = Date.now();
  if (state.last_commit_cleanup_at && now - state.last_commit_cleanup_at < 24 * 60 * 60 * 1_000) return;
  updateDesktopCloudSyncState(scopeId, { last_commit_cleanup_at: now });
  const prefix = `${normalizeCloudPrefix(config.prefix)}/system/v2/commits/`;
  const keys = await client.listObjectKeys(prefix, signal);
  const obsolete = keys.sort((left, right) => right.localeCompare(left)).slice(20);
  await Promise.all(obsolete.map((key) => client.deleteObject(key, signal)));
}

export async function ensureV2ActivationMarker(
  client: DesktopR2Client,
  config: CloudStorageConfig,
  scopeId: string,
  signal?: AbortSignal,
): Promise<void> {
  await client.putJsonConditional(
    buildCloudV2ActivationObjectKey(config.prefix),
    { schema_version: 2, activated_at: Date.now() },
    { ifNoneMatch: '*', signal },
  );
  updateDesktopCloudSyncState(scopeId, { activation_marker_confirmed: 1 });
}

export function queueReplacedRemoteBlobsForGc(
  scopeId: string,
  previous: CloudLibraryManifestV2 | null,
  published: CloudLibraryManifestV2,
): void {
  if (!previous) return;
  const eligibleAt = Date.now() + 30 * 24 * 60 * 60 * 1_000;
  const insert = getDb().prepare(`
    INSERT INTO cloud_sync_blob_gc (scope_id, object_key, eligible_at) VALUES (?, ?, ?)
    ON CONFLICT(scope_id, object_key) DO UPDATE SET
      eligible_at = MAX(cloud_sync_blob_gc.eligible_at, excluded.eligible_at)
  `);
  const nextTracks = new Map(published.tracks.map((record) => [record.content_hash_sha256, record]));
  for (const record of previous.tracks) {
    if (record.deleted || !nextTracks.get(record.content_hash_sha256)?.deleted) continue;
    insert.run(scopeId, record.entry.object_key, eligibleAt);
    if (record.entry.artwork_object_key) insert.run(scopeId, record.entry.artwork_object_key, eligibleAt);
  }
  const nextPlaylists = new Map(published.playlists.map((record) => [record.cloud_id, record]));
  for (const record of previous.playlists) {
    if (record.deleted || !nextPlaylists.get(record.cloud_id)?.deleted) continue;
    if (record.entry.cover_object_key) insert.run(scopeId, record.entry.cover_object_key, eligibleAt);
  }
}

export function isManagedLibraryFile(filePath: string): boolean {
  const relative = path.relative(path.resolve(getLibraryDir()), path.resolve(filePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
