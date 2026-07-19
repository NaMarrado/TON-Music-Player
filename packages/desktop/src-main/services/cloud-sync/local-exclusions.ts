import {
  buildCloudV2ManifestObjectKey,
  buildCloudLocalDeletionPreview,
  parseCloudLibraryManifestV2,
  partitionCloudManifestForLocalExclusions,
  type CloudLibraryManifestV2,
  type CloudLocalDeletionPreview,
  type CloudTrackRecordV2,
} from '@ton/core';
import { getDb } from '../database';
import { activateDesktopCloudScope, getDesktopCloudConfig } from './config';
import { DesktopR2Client } from './r2-client';

export function getDesktopCloudLocalExclusionHashes(scopeId: string): Set<string> {
  const rows = getDb().prepare(`
    SELECT content_hash_sha256
    FROM cloud_sync_local_exclusions
    WHERE scope_id = ?
  `).all(scopeId) as Array<{ content_hash_sha256: string }>;
  return new Set(rows.map((row) => row.content_hash_sha256.toLowerCase()));
}

export function clearDesktopCloudLocalExclusions(
  scopeId: string,
  hashes: Iterable<string>,
): number {
  const normalized = [...new Set([...hashes].map((hash) => hash.toLowerCase()))];
  if (normalized.length === 0) return 0;
  const placeholders = normalized.map(() => '?').join(',');
  return getDb().prepare(`
    DELETE FROM cloud_sync_local_exclusions
    WHERE scope_id = ? AND content_hash_sha256 IN (${placeholders})
  `).run(scopeId, ...normalized).changes;
}

export function pruneDesktopCloudLocalExclusions(
  scopeId: string,
  liveHashes: ReadonlySet<string>,
): void {
  const db = getDb();
  const rows = db.prepare(`
    SELECT content_hash_sha256
    FROM cloud_sync_local_exclusions
    WHERE scope_id = ?
  `).all(scopeId) as Array<{ content_hash_sha256: string }>;
  const stale = rows
    .map((row) => row.content_hash_sha256)
    .filter((hash) => !liveHashes.has(hash.toLowerCase()));
  if (stale.length === 0) return;
  const placeholders = stale.map(() => '?').join(',');
  db.prepare(`
    DELETE FROM cloud_sync_local_exclusions
    WHERE scope_id = ? AND content_hash_sha256 IN (${placeholders})
  `).run(scopeId, ...stale);
}

export function storeDesktopExcludedTrackMirrors(
  scopeId: string,
  records: CloudTrackRecordV2[],
): void {
  if (records.length === 0) return;
  const db = getDb();
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO cloud_sync_entities (
      scope_id, entity_type, entity_key, record_json, version_counter,
      version_device_id, is_deleted, updated_at
    ) VALUES (?, 'track', ?, ?, ?, ?, ?, strftime('%s','now'))
  `);
  db.transaction(() => {
    for (const record of records) {
      upsert.run(
        scopeId,
        record.content_hash_sha256,
        JSON.stringify(record),
        record.version.counter,
        record.version.device_id,
        record.deleted ? 1 : 0,
      );
    }
  })();
}

export function prepareDesktopManifestForLocalDevice(
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  restoreLocallyDeleted: boolean,
): {
  manifest: CloudLibraryManifestV2;
  excludedRecords: CloudTrackRecordV2[];
  restored: number;
} {
  const exclusions = getDesktopCloudLocalExclusionHashes(scopeId);
  const partition = partitionCloudManifestForLocalExclusions(
    manifest,
    exclusions,
    restoreLocallyDeleted,
  );
  pruneDesktopCloudLocalExclusions(scopeId, partition.liveHashes);
  const restored = restoreLocallyDeleted
    ? clearDesktopCloudLocalExclusions(scopeId, partition.matchingHashes)
    : 0;
  return {
    manifest: partition.manifest,
    excludedRecords: partition.excludedRecords,
    restored,
  };
}

export async function previewDesktopCloudLocalDeletions(
  signal?: AbortSignal,
): Promise<CloudLocalDeletionPreview> {
  const config = getDesktopCloudConfig();
  if (!config) throw new Error('cloud_storage_not_configured');
  const scopeId = activateDesktopCloudScope(config);
  const read = await new DesktopR2Client(config).getJsonConditional<CloudLibraryManifestV2>(
    buildCloudV2ManifestObjectKey(config.prefix),
    { signal },
  );
  if (read.status !== 'ok') return { deletedTracks: 0, reclaimableBytes: 0 };
  const manifest = parseCloudLibraryManifestV2(read.value);
  if (!manifest) throw new Error('cloud_sync_invalid_v2_manifest');
  const exclusions = getDesktopCloudLocalExclusionHashes(scopeId);
  return buildCloudLocalDeletionPreview(manifest.tracks, exclusions);
}
