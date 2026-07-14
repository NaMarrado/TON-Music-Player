import type { CloudAutoSyncStatus, CloudAutoSyncState } from '@ton/core';
import { getDb } from '../database';
import {
  activateDesktopCloudScope,
  getDesktopCloudAutoSyncEnabled,
  getDesktopCloudConfig,
} from './config';

export interface DesktopCloudOutboxEntry {
  id: number;
  scope_id: string;
  entity_type: 'track' | 'playlist' | 'library';
  entity_key: string;
  local_id: number | null;
  operation: 'upsert' | 'delete' | 'reconcile';
  payload_json: string | null;
  generation: number;
}

export interface DesktopCloudSyncStateRow {
  scope_id: string;
  revision: string | null;
  etag: string | null;
  lamport_counter: number;
  last_success_at: number | null;
  last_error: string | null;
  next_retry_at: number | null;
  needs_full_reconcile: number;
  pending_remote_revision: string | null;
  pending_downloads: number;
  last_commit_cleanup_at: number | null;
  activation_marker_confirmed: number;
}

export function getActiveDesktopCloudScope(): string | null {
  const config = getDesktopCloudConfig();
  return config ? activateDesktopCloudScope(config) : null;
}

export function readDesktopCloudSyncState(scopeId: string): DesktopCloudSyncStateRow {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO cloud_sync_state (scope_id, needs_full_reconcile)
    VALUES (?, 1)
  `).run(scopeId);
  return db.prepare(`
    SELECT * FROM cloud_sync_state WHERE scope_id = ?
  `).get(scopeId) as DesktopCloudSyncStateRow;
}

export function readDesktopCloudOutbox(scopeId: string): DesktopCloudOutboxEntry[] {
  return getDb().prepare(`
    SELECT id, scope_id, entity_type, entity_key, local_id, operation,
           payload_json, generation
    FROM cloud_sync_outbox
    WHERE scope_id = ?
    ORDER BY generation ASC, id ASC
  `).all(scopeId) as DesktopCloudOutboxEntry[];
}

export function getDesktopCloudGeneration(): number {
  const row = getDb().prepare(`
    SELECT generation FROM cloud_sync_control WHERE id = 1
  `).get() as { generation: number } | undefined;
  return row?.generation ?? 0;
}

export function acknowledgeDesktopCloudOutbox(scopeId: string, generation: number): void {
  getDb().prepare(`
    DELETE FROM cloud_sync_outbox
    WHERE scope_id = ? AND generation <= ?
  `).run(scopeId, generation);
}

export function setDesktopCloudOutboxSuppressed<T>(run: () => T): T {
  const db = getDb();
  db.prepare(`
    UPDATE cloud_sync_control
    SET suppress_outbox = suppress_outbox + 1
    WHERE id = 1
  `).run();
  try {
    return run();
  } finally {
    db.prepare(`
      UPDATE cloud_sync_control
      SET suppress_outbox = MAX(0, suppress_outbox - 1)
      WHERE id = 1
    `).run();
  }
}

export function updateDesktopCloudSyncState(
  scopeId: string,
  patch: Partial<Omit<DesktopCloudSyncStateRow, 'scope_id'>>,
): void {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }
  const allowed = new Set([
    'revision', 'etag', 'lamport_counter', 'last_success_at', 'last_error',
    'next_retry_at', 'needs_full_reconcile', 'pending_remote_revision', 'pending_downloads',
    'last_commit_cleanup_at',
    'activation_marker_confirmed',
  ]);
  const safeEntries = entries.filter(([key]) => allowed.has(key));
  if (safeEntries.length === 0) {
    return;
  }
  readDesktopCloudSyncState(scopeId);
  const assignments = safeEntries.map(([key]) => `${key} = ?`).join(', ');
  getDb().prepare(`UPDATE cloud_sync_state SET ${assignments} WHERE scope_id = ?`)
    .run(...safeEntries.map(([, value]) => value), scopeId);
}

export function readDesktopCloudAutoSyncStatus(
  runtimeState?: CloudAutoSyncState,
): CloudAutoSyncStatus {
  const enabled = getDesktopCloudAutoSyncEnabled();
  const scopeId = getActiveDesktopCloudScope();
  if (!scopeId) {
    return {
      enabled,
      configured: false,
      state: enabled ? 'unconfigured' : 'disabled',
      pendingChanges: 0,
      pendingDownloads: 0,
      lastSuccessAt: null,
      lastErrorKey: null,
      nextRetryAt: null,
    };
  }
  const state = readDesktopCloudSyncState(scopeId);
  const pending = getDb().prepare(`
    SELECT COUNT(*) AS count FROM cloud_sync_outbox WHERE scope_id = ?
  `).get(scopeId) as { count: number };
  return {
    enabled,
    configured: true,
    state: enabled ? (runtimeState ?? (state.last_error ? 'error' : 'idle')) : 'disabled',
    pendingChanges: pending.count,
    pendingDownloads: state.pending_downloads,
    lastSuccessAt: state.last_success_at,
    lastErrorKey: state.last_error,
    nextRetryAt: state.next_retry_at,
  };
}
