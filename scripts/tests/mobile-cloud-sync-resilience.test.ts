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
import { migrate015 } from '../../packages/mobile/src/services/migrations/015-cloud-outbox-path-repair.ts';
import { shouldRunManualCloudRepair } from '../../packages/mobile/src/services/cloud-sync/manual-repair-policy.ts';

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

test('only explicit manual upload runs a full cloud object repair', () => {
  assert.equal(shouldRunManualCloudRepair('manual', 'sync'), false);
  assert.equal(shouldRunManualCloudRepair('manual', 'fetch'), false);
  assert.equal(shouldRunManualCloudRepair('manual', 'upload'), true);
  assert.equal(shouldRunManualCloudRepair('auto', 'upload'), false);
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

test('path repair migration removes mirrored upserts but preserves real edits', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE tracks (
        id INTEGER PRIMARY KEY,
        title TEXT, artist TEXT, album TEXT, album_artist TEXT,
        track_number INTEGER, disc_number INTEGER, duration_ms INTEGER,
        genre TEXT, year INTEGER, bitrate INTEGER, sample_rate INTEGER,
        file_size INTEGER, format TEXT, loudness_lufs REAL, loudness_gain REAL,
        youtube_id TEXT, spotify_id TEXT, soundcloud_id TEXT, source_url TEXT,
        rating INTEGER, downloaded_at INTEGER, cover_art_path TEXT,
        content_hash_sha256 TEXT
      );
      CREATE TABLE cloud_sync_outbox (
        scope_id TEXT, entity_type TEXT, entity_key TEXT, local_id INTEGER,
        operation TEXT
      );
      CREATE TABLE cloud_sync_entities (
        scope_id TEXT, entity_type TEXT, entity_key TEXT, deleted INTEGER,
        record_json TEXT
      );
      CREATE TABLE cloud_sync_hash_cache (file_path TEXT, sha256 TEXT);
    `);
    const entry = {
      entry: {
        content_hash_sha256: 'hash-a',
        file_size: 10,
        format: 'm4a',
        artwork_hash_sha256: 'art-a',
        youtube_id: null,
        spotify_id: null,
        soundcloud_id: null,
        source_url: null,
        downloaded_at: 123,
        metadata: {
          title: 'Title', artist: 'Artist', album: null, album_artist: null,
          track_number: null, disc_number: null, duration_ms: 1000,
          genre: null, year: null, bitrate: 96000, sample_rate: 44100,
          loudness_lufs: null, loudness_gain: null, rating: 0,
        },
      },
    };
    const insertTrack = db.prepare(`
      INSERT INTO tracks VALUES (
        ?, ?, 'Artist', NULL, NULL, NULL, NULL, 1000, NULL, NULL, 96000, 44100,
        10, 'm4a', NULL, NULL, NULL, NULL, NULL, NULL, 0, 123, ?, ?
      )
    `);
    insertTrack.run(1, 'Title', '/new/container/cover.jpg', 'hash-a');
    insertTrack.run(2, 'Locally edited', '/new/container/cover.jpg', 'hash-b');
    db.prepare('INSERT INTO cloud_sync_hash_cache VALUES (?, ?)')
      .run('/new/container/cover.jpg', 'art-a');
    const insertEntity = db.prepare('INSERT INTO cloud_sync_entities VALUES (?, ?, ?, 0, ?)');
    insertEntity.run('scope', 'track', 'hash-a', JSON.stringify(entry));
    insertEntity.run('scope', 'track', 'hash-b', JSON.stringify({
      ...entry,
      entry: { ...entry.entry, content_hash_sha256: 'hash-b' },
    }));
    const insertOutbox = db.prepare(
      "INSERT INTO cloud_sync_outbox VALUES ('scope', 'track', ?, ?, 'upsert')",
    );
    insertOutbox.run('hash-a', 1);
    insertOutbox.run('hash-b', 2);

    await migrate015({ execAsync: async (sql: string) => { db.exec(sql); } } as never);

    assert.deepEqual(
      db.prepare('SELECT entity_key FROM cloud_sync_outbox ORDER BY entity_key').all(),
      [{ entity_key: 'hash-b' }],
    );
  } finally {
    db.close();
  }
});
