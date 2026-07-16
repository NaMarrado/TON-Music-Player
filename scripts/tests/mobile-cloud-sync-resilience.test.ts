import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {
  getCloudDownloadRetryDelaySeconds,
  shouldDeferCloudTrackDownload,
} from '../../packages/mobile/src/services/cloud-sync/download-failure-policy.ts';
import { resolveAvailablePlaylistTrackIds } from '../../packages/mobile/src/services/cloud-sync/playlist-memberships.ts';
import { migrate013 } from '../../packages/mobile/src/services/migrations/013-cloud-download-failures.ts';
import { migrate014 } from '../../packages/mobile/src/services/migrations/014-cloud-download-retries.ts';

test('a failed cloud track does not prevent the playlist from importing available tracks', () => {
  const trackIds = new Map([
    ['hash-first', 11],
    ['hash-third', 33],
  ]);

  assert.deepEqual(
    resolveAvailablePlaylistTrackIds(
      ['hash-first', 'hash-missing', 'hash-third', 'hash-first'],
      trackIds,
    ),
    [11, 33, 11],
  );
});

test('the same broken object is deferred for one cloud revision but manual retry remains possible', () => {
  const failedHashes = new Set(['hash-missing']);
  assert.equal(shouldDeferCloudTrackDownload({
    retryFailed: false,
    hasLocalAudio: false,
    contentHash: 'hash-missing',
    failedHashes,
  }), true);
  assert.equal(shouldDeferCloudTrackDownload({
    retryFailed: true,
    hasLocalAudio: false,
    contentHash: 'hash-missing',
    failedHashes,
  }), false);
  assert.equal(shouldDeferCloudTrackDownload({
    retryFailed: false,
    hasLocalAudio: true,
    contentHash: 'hash-missing',
    failedHashes,
  }), false);
});

test('cloud audio retry backoff grows and is capped', () => {
  assert.equal(getCloudDownloadRetryDelaySeconds(1), 30);
  assert.equal(getCloudDownloadRetryDelaySeconds(2), 60);
  assert.equal(getCloudDownloadRetryDelaySeconds(6), 900);
  assert.equal(getCloudDownloadRetryDelaySeconds(30), 900);
});

test('mobile migration stores one failure per scope and track hash', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE cloud_sync_state (
        scope_id TEXT PRIMARY KEY,
        pending_downloads INTEGER NOT NULL DEFAULT 0
      );
    `);
    await migrate013({
      execAsync: async (sql: string) => { db.exec(sql); },
    } as never);
    db.prepare(`
      INSERT INTO cloud_sync_download_failures(
        scope_id, content_hash_sha256, manifest_revision, error_message
      ) VALUES (?, ?, ?, ?)
    `).run('scope', 'hash', 'revision-a', 'missing');
    db.prepare('INSERT INTO cloud_sync_state(scope_id) VALUES (?)').run('scope');
    await migrate014({
      execAsync: async (sql: string) => { db.exec(sql); },
      getAllAsync: async (sql: string) => db.prepare(sql).all(),
    } as never);
    assert.throws(() => db.prepare(`
      INSERT INTO cloud_sync_download_failures(
        scope_id, content_hash_sha256, manifest_revision, error_message
      ) VALUES (?, ?, ?, ?)
    `).run('scope', 'hash', 'revision-a', 'again'));
    const columns = db.prepare(`PRAGMA table_info('cloud_sync_download_failures')`)
      .all() as Array<{ name: string }>;
    assert.deepEqual(columns.map((column) => column.name), [
      'scope_id', 'content_hash_sha256', 'manifest_revision', 'error_message', 'failed_at',
      'attempt_count', 'next_retry_at',
    ]);
    assert.equal(
      db.prepare('SELECT pending_downloads FROM cloud_sync_state WHERE scope_id = ?')
        .get('scope')?.pending_downloads,
      1,
    );
  } finally {
    db.close();
  }
});
