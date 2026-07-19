import type { CloudLibraryManifestV2 } from '@ton/core';
import { getDb } from '../database';
import { getMobileCloudProtectedEntities } from './local-state';
import { throwIfAborted } from './v2-common';
import { runMobileCloudDbLane } from './db-lane';

export async function storeEntityMirror(
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  afterGeneration: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  await runMobileCloudDbLane(() => getDb().withExclusiveTransactionAsync(async (db) => {
    const protectedEntities = await getMobileCloudProtectedEntities(scopeId, afterGeneration, db);
    const upsert = async (
      entityType: 'track' | 'playlist',
      entityKey: string,
      record: CloudLibraryManifestV2['tracks'][number] | CloudLibraryManifestV2['playlists'][number],
    ) => {
      await db.runAsync(
        `INSERT INTO cloud_sync_entities(
          scope_id, entity_type, entity_key, version_counter,
          version_device_id, record_json, deleted, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
        ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
          version_counter = excluded.version_counter,
          version_device_id = excluded.version_device_id,
          record_json = excluded.record_json,
          deleted = excluded.deleted,
          updated_at = excluded.updated_at`,
        [
          scopeId, entityType, entityKey, record.version.counter,
          record.version.device_id, JSON.stringify(record), record.deleted ? 1 : 0,
        ],
      );
    };
    for (const record of manifest.tracks) {
      throwIfAborted(signal);
      if (!protectedEntities.trackHashes.has(record.content_hash_sha256)) {
        await upsert('track', record.content_hash_sha256, record);
      }
    }
    for (const record of manifest.playlists) {
      throwIfAborted(signal);
      if (!protectedEntities.playlistCloudIds.has(record.cloud_id)) {
        await upsert('playlist', record.cloud_id, record);
      }
    }
  }));
  throwIfAborted(signal);
}
