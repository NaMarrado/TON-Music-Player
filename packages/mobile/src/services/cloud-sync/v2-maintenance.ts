import type {
  CloudLibraryManifestV2,
  CloudPlaylistRecordV2,
  CloudStorageConfig,
  CloudTrackRecordV2,
} from '@ton/core';
import { normalizeCloudPrefix } from '@ton/core';
import { getDb } from '../database';
import { updateMobileCloudPersistedState } from './local-state';
import { MobileR2Client } from './r2-client';
import { liveManifestObjectKeys } from './v2-upload';

export async function queueBlobGcTransitions(
  scopeId: string,
  previousRemote: CloudLibraryManifestV2 | null,
  published: CloudLibraryManifestV2,
): Promise<void> {
  const previousTracks = new Map(
    previousRemote?.tracks.map((record) => [record.content_hash_sha256, record]) ?? [],
  );
  const previousPlaylists = new Map(
    previousRemote?.playlists.map((record) => [record.cloud_id, record]) ?? [],
  );
  const rows = await getDb().getAllAsync<{
    entity_type: 'track' | 'playlist'; entity_key: string; record_json: string;
  }>('SELECT entity_type, entity_key, record_json FROM cloud_sync_entities WHERE scope_id = ?', [scopeId]);
  const mirror = new Map(rows.map((row) => [`${row.entity_type}:${row.entity_key}`, row.record_json]));
  const readMirror = <T extends CloudTrackRecordV2 | CloudPlaylistRecordV2>(identity: string): T | null => {
    const raw = mirror.get(identity);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  };
  const candidates = new Set<string>();
  for (const record of published.tracks) {
    const previousRecords = [
      previousTracks.get(record.content_hash_sha256),
      readMirror<CloudTrackRecordV2>(`track:${record.content_hash_sha256}`),
    ];
    for (const previous of previousRecords) {
      if (!previous || previous.deleted) continue;
      if (record.deleted || previous.entry.object_key !== record.entry.object_key) {
        candidates.add(previous.entry.object_key);
      }
      if (previous.entry.artwork_object_key
          && (record.deleted
            || previous.entry.artwork_object_key !== record.entry.artwork_object_key)) {
        candidates.add(previous.entry.artwork_object_key);
      }
    }
  }
  for (const record of published.playlists) {
    const previousRecords = [
      previousPlaylists.get(record.cloud_id),
      readMirror<CloudPlaylistRecordV2>(`playlist:${record.cloud_id}`),
    ];
    for (const previous of previousRecords) {
      if (previous && !previous.deleted && previous.entry.cover_object_key
          && (record.deleted
            || previous.entry.cover_object_key !== record.entry.cover_object_key)) {
        candidates.add(previous.entry.cover_object_key);
      }
    }
  }
  const liveKeys = liveManifestObjectKeys(published);
  const eligibleAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  await getDb().withExclusiveTransactionAsync(async (db) => {
    for (const key of liveKeys) {
      await db.runAsync(
        'DELETE FROM cloud_sync_blob_gc WHERE scope_id = ? AND object_key = ?', [scopeId, key],
      );
    }
    for (const key of candidates) {
      if (liveKeys.has(key)) continue;
      await db.runAsync(
        `INSERT INTO cloud_sync_blob_gc(scope_id, object_key, eligible_at) VALUES (?, ?, ?)
         ON CONFLICT(scope_id, object_key) DO UPDATE SET
           eligible_at = MIN(cloud_sync_blob_gc.eligible_at, excluded.eligible_at)`,
        [scopeId, key, eligibleAt],
      );
    }
  });
}

export async function runDailyCloudMaintenance(
  client: MobileR2Client,
  config: CloudStorageConfig,
  scopeId: string,
  lastCleanupAt: number | null,
  signal?: AbortSignal,
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (lastCleanupAt != null && nowSeconds - lastCleanupAt < 24 * 60 * 60) return;
  const root = normalizeCloudPrefix(config.prefix);
  const commitKeys = await client.listObjectKeys(`${root}/system/v2/commits/`, signal);
  const stale = [...commitKeys].sort().slice(0, Math.max(0, commitKeys.length - 20));
  await Promise.all(stale.map((key) => client.deleteObject(key, signal)));
  await updateMobileCloudPersistedState(scopeId, { last_cleanup_at: nowSeconds });
}
