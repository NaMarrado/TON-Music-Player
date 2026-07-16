import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { shouldDeferCloudTrackDownload } from '../../packages/mobile/src/services/cloud-sync/download-failure-policy.ts';
import { resolveAvailablePlaylistTrackIds } from '../../packages/mobile/src/services/cloud-sync/playlist-memberships.ts';
import { migrate013 } from '../../packages/mobile/src/services/migrations/013-cloud-download-failures.ts';

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

test('mobile migration stores one failure per scope and track hash', async () => {
  const db = new Database(':memory:');
  try {
    await migrate013({
      execAsync: async (sql: string) => { db.exec(sql); },
    } as never);
    db.prepare(`
      INSERT INTO cloud_sync_download_failures(
        scope_id, content_hash_sha256, manifest_revision, error_message
      ) VALUES (?, ?, ?, ?)
    `).run('scope', 'hash', 'revision-a', 'missing');
    assert.throws(() => db.prepare(`
      INSERT INTO cloud_sync_download_failures(
        scope_id, content_hash_sha256, manifest_revision, error_message
      ) VALUES (?, ?, ?, ?)
    `).run('scope', 'hash', 'revision-a', 'again'));
    const columns = db.prepare(`PRAGMA table_info('cloud_sync_download_failures')`)
      .all() as Array<{ name: string }>;
    assert.deepEqual(columns.map((column) => column.name), [
      'scope_id', 'content_hash_sha256', 'manifest_revision', 'error_message', 'failed_at',
    ]);
  } finally {
    db.close();
  }
});
