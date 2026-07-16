import type { SQLiteDatabase } from 'expo-sqlite';
import type { CloudStorageConfig } from '@ton/core';
import { getDb } from '../database';
import { buildMobileCloudScopeId } from './config';

export interface MobileCloudOutboxRow {
  scope_id: string;
  entity_type: 'track' | 'playlist';
  entity_key: string;
  local_id: number | null;
  operation: 'upsert' | 'delete';
  payload_json: string | null;
  generation: number;
  created_at: number;
}

export interface MobileCloudPersistedState {
  scope_id: string;
  revision: string | null;
  etag: string | null;
  lamport_counter: number;
  last_success_at: number | null;
  last_error: string | null;
  next_retry_at: number | null;
  last_cleanup_at: number | null;
  needs_full_reconcile: number;
  pending_downloads: number;
  pending_assets: number;
  activation_marker_confirmed: number;
}

export interface MobileCloudProtectedEntities {
  trackHashes: Set<string>;
  playlistCloudIds: Set<string>;
}

export async function ensureMobileCloudScope(config: CloudStorageConfig): Promise<string> {
  const scopeId = buildMobileCloudScopeId(config);
  const db = getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT OR IGNORE INTO cloud_sync_state(scope_id)
       VALUES (?)`,
      [scopeId],
    );
    await txn.runAsync(
      `INSERT INTO cloud_sync_outbox(
         scope_id, entity_type, entity_key, local_id, operation,
         payload_json, generation, created_at
       )
       SELECT ?, entity_type, entity_key, local_id, operation,
              payload_json, generation, created_at
       FROM cloud_sync_outbox
       WHERE scope_id = ''
       ON CONFLICT(scope_id, entity_type, entity_key) DO UPDATE SET
         local_id = excluded.local_id,
         operation = excluded.operation,
         payload_json = excluded.payload_json,
         generation = MAX(cloud_sync_outbox.generation, excluded.generation),
         created_at = MAX(cloud_sync_outbox.created_at, excluded.created_at)`,
      [scopeId],
    );
    await txn.runAsync("DELETE FROM cloud_sync_outbox WHERE scope_id = ''");
  });
  return scopeId;
}

export async function getMobileCloudPersistedState(
  scopeId: string,
): Promise<MobileCloudPersistedState> {
  const db = getDb();
  await db.runAsync('INSERT OR IGNORE INTO cloud_sync_state(scope_id) VALUES (?)', [scopeId]);
  const row = await db.getFirstAsync<MobileCloudPersistedState>(
    `SELECT scope_id, revision, etag, lamport_counter, last_success_at,
            last_error, next_retry_at, last_cleanup_at, needs_full_reconcile,
            pending_downloads, pending_assets, activation_marker_confirmed
     FROM cloud_sync_state WHERE scope_id = ?`,
    [scopeId],
  );
  if (!row) {
    throw new Error('cloud_sync_state_unavailable');
  }
  return row;
}

export async function getMobileCloudOutbox(
  scopeId: string,
): Promise<MobileCloudOutboxRow[]> {
  return getDb().getAllAsync<MobileCloudOutboxRow>(
    `SELECT scope_id, entity_type, entity_key, local_id, operation,
            payload_json, generation, created_at
     FROM cloud_sync_outbox
     WHERE scope_id = ?
     ORDER BY generation ASC`,
    [scopeId],
  );
}

export async function getMobileCloudPendingCount(scopeId?: string): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    scopeId
      ? 'SELECT COUNT(*) AS count FROM cloud_sync_outbox WHERE scope_id IN (?, \'\')'
      : 'SELECT COUNT(*) AS count FROM cloud_sync_outbox',
    scopeId ? [scopeId] : [],
  );
  return row?.count ?? 0;
}

export async function getMobileCloudMissingMirroredEntityCount(
  scopeId: string,
): Promise<number> {
  const row = await getDb().getFirstAsync<{ count: number }>(
    `SELECT
       (SELECT COUNT(*)
        FROM cloud_sync_entities AS entity
        WHERE entity.scope_id = ?
          AND entity.entity_type = 'track'
          AND entity.deleted = 0
          AND NOT EXISTS (
            SELECT 1 FROM tracks
            WHERE lower(tracks.content_hash_sha256) = lower(entity.entity_key)
          ))
       +
       (SELECT COUNT(*)
        FROM cloud_sync_entities AS entity
        WHERE entity.scope_id = ?
          AND entity.entity_type = 'playlist'
          AND entity.deleted = 0
          AND NOT EXISTS (
            SELECT 1 FROM playlists
            WHERE playlists.cloud_id = entity.entity_key
          )) AS count`,
    [scopeId, scopeId],
  );
  return row?.count ?? 0;
}

export async function getMobileCloudJournalGeneration(): Promise<number> {
  const row = await getDb().getFirstAsync<{ generation: number }>(
    'SELECT generation FROM cloud_sync_control WHERE id = 1',
  );
  return row?.generation ?? 0;
}

export async function getMobileCloudProtectedEntities(
  scopeId: string,
  afterGeneration: number,
  database?: SQLiteDatabase,
): Promise<MobileCloudProtectedEntities> {
  const db = database ?? getDb();
  const rows = await db.getAllAsync<MobileCloudOutboxRow>(
    `SELECT scope_id, entity_type, entity_key, local_id, operation,
            payload_json, generation, created_at
     FROM cloud_sync_outbox
     WHERE scope_id IN (?, '') AND generation > ?`,
    [scopeId, afterGeneration],
  );
  const trackHashes = new Set<string>();
  const playlistCloudIds = new Set<string>();
  for (const row of rows) {
    let payload: Record<string, unknown> = {};
    if (row.payload_json) {
      try {
        payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    if (row.entity_type === 'track') {
      const deletedHash = payload.content_hash_sha256;
      if (typeof deletedHash === 'string' && deletedHash) {
        trackHashes.add(deletedHash);
      }
      if (row.operation === 'upsert' && row.local_id != null) {
        const local = await db.getFirstAsync<{ content_hash_sha256: string | null }>(
          'SELECT content_hash_sha256 FROM tracks WHERE id = ?',
          [row.local_id],
        );
        if (local?.content_hash_sha256) {
          trackHashes.add(local.content_hash_sha256);
        }
      }
    } else {
      const deletedCloudId = payload.cloud_id;
      if (typeof deletedCloudId === 'string' && deletedCloudId) {
        playlistCloudIds.add(deletedCloudId);
      }
      if (row.operation === 'upsert' && row.local_id != null) {
        const local = await db.getFirstAsync<{ cloud_id: string | null }>(
          'SELECT cloud_id FROM playlists WHERE id = ?',
          [row.local_id],
        );
        if (local?.cloud_id) {
          playlistCloudIds.add(local.cloud_id);
        }
      }
    }
  }
  return { trackHashes, playlistCloudIds };
}

export async function acknowledgeMobileCloudOutbox(
  scopeId: string,
  throughGeneration: number,
): Promise<void> {
  await getDb().runAsync(
    `DELETE FROM cloud_sync_outbox
     WHERE scope_id = ? AND generation <= ?`,
    [scopeId, throughGeneration],
  );
}

export async function updateMobileCloudPersistedState(
  scopeId: string,
  patch: Partial<Omit<MobileCloudPersistedState, 'scope_id'>>,
): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }
  const allowed = new Set([
    'revision', 'etag', 'lamport_counter', 'last_success_at', 'last_error', 'next_retry_at',
    'last_cleanup_at', 'needs_full_reconcile', 'pending_downloads', 'pending_assets',
    'activation_marker_confirmed',
  ]);
  const safeEntries = entries.filter(([key]) => allowed.has(key));
  if (safeEntries.length === 0) {
    return;
  }
  const assignments = safeEntries.map(([key]) => `${key} = ?`).join(', ');
  await getDb().runAsync(
    `UPDATE cloud_sync_state
     SET ${assignments}, updated_at = strftime('%s','now')
     WHERE scope_id = ?`,
    [...safeEntries.map(([, value]) => value), scopeId],
  );
}

export async function withMobileCloudOutboxSuppressed<T>(
  run: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = getDb();
  let result!: T;
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE cloud_sync_control SET suppress_outbox = 1 WHERE id = 1');
    try {
      result = await run(txn);
    } finally {
      await txn.runAsync('UPDATE cloud_sync_control SET suppress_outbox = 0 WHERE id = 1');
    }
  });
  return result;
}

export async function acquireMobileCloudLease(owner: string, durationSeconds = 120): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await getDb().runAsync(
    `UPDATE cloud_sync_control
     SET lease_owner = ?, lease_expires_at = ?
     WHERE id = 1
       AND (lease_owner IS NULL OR lease_owner = ? OR lease_expires_at IS NULL OR lease_expires_at <= ?)`,
    [owner, now + durationSeconds, owner, now],
  );
  return result.changes > 0;
}

export async function releaseMobileCloudLease(owner: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE cloud_sync_control
     SET lease_owner = NULL, lease_expires_at = NULL
     WHERE id = 1 AND lease_owner = ?`,
    [owner],
  );
}

export async function renewMobileCloudLease(
  owner: string,
  durationSeconds = 120,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await getDb().runAsync(
    `UPDATE cloud_sync_control
     SET lease_expires_at = ?
     WHERE id = 1 AND lease_owner = ? AND lease_expires_at > ?`,
    [now + durationSeconds, owner, now],
  );
  return result.changes > 0;
}

export async function recoverMobileCloudControl(
  releaseLeaseFromPreviousProcess = false,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Suppression is transaction-scoped. An older build may nevertheless have
  // crashed after persisting the flag, so clear it unconditionally at startup.
  // A live apply transaction holds SQLite's exclusive lock and cannot be
  // interleaved with this recovery write.
  await getDb().runAsync(
    'UPDATE cloud_sync_control SET suppress_outbox = 0 WHERE id = 1',
  );
  await getDb().runAsync(
    `UPDATE cloud_sync_control
     SET lease_owner = NULL,
         lease_expires_at = NULL
     WHERE id = 1
       AND (? = 1 OR lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)`,
    [releaseLeaseFromPreviousProcess ? 1 : 0, now],
  );
}
