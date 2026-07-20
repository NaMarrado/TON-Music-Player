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
import { migrate016 } from '../../packages/mobile/src/services/migrations/016-local-cloud-exclusions.ts';
import { shouldRunManualCloudRepair } from '../../packages/mobile/src/services/cloud-sync/manual-repair-policy.ts';
import { selectMobileCloudApplyDeltaFromState } from '../../packages/mobile/src/services/cloud-sync/v2-apply-delta-policy.ts';

function createCloudRecord(index: number) {
  const hash = index.toString(16).padStart(64, '0');
  return {
    deleted: false as const,
    content_hash_sha256: hash,
    version: { counter: index + 1, device_id: 'fixture' },
    entry: {
      content_hash_sha256: hash,
      object_key: `ton/library/${hash}.m4a`,
      file_name: `${hash}.m4a`,
      file_size: 100,
      format: 'm4a' as const,
      artwork_hash_sha256: null,
      artwork_object_key: null,
      artwork_file_name: null,
      youtube_id: null,
      spotify_id: null,
      soundcloud_id: null,
      source_url: null,
      downloaded_at: 1,
      added_at: 1,
      updated_at: 1,
      metadata: {
        title: `Track ${index}`, artist: 'Fixture', album: null, album_artist: null,
        track_number: null, disc_number: null, duration_ms: 1_000, genre: null,
        year: null, bitrate: 96_000, sample_rate: 44_100, loudness_lufs: null,
        loudness_gain: null, rating: 0,
      },
    },
  };
}

test('mobile sync applies only manifest deltas instead of all 1600 tracks', () => {
  const tracks = Array.from({ length: 1_600 }, (_, index) => createCloudRecord(index));
  const changed = createCloudRecord(1_600);
  const manifest = {
    schema_version: 2 as const,
    app: 'TON' as const,
    created_at: 1,
    updated_at: 2,
    writer_device_id: 'fixture',
    revision: 'revision-2',
    max_counter: 1_601,
    tracks: [...tracks, changed],
    playlists: [],
  };
  const mirror = new Map(
    tracks.map((record) => [`track:${record.content_hash_sha256}`, JSON.stringify(record)]),
  );
  const localTracks = new Map(tracks.map((record) => [record.content_hash_sha256, null]));

  const delta = selectMobileCloudApplyDeltaFromState(manifest, {
    mirror,
    localTrackArtworkByHash: localTracks,
    localPlaylistCoverByCloudId: new Map(),
    failedTrackHashes: new Set(),
  });

  assert.deepEqual(delta.tracks.map((record) => record.content_hash_sha256), [
    changed.content_hash_sha256,
  ]);
});

test('mobile sync keeps unchanged tracks and playlists out of the apply delta', () => {
  const track = createCloudRecord(12);
  const playlist = {
    deleted: false as const,
    cloud_id: 'fixture-playlist',
    version: { counter: 14, device_id: 'fixture' },
    entry: {
      cloud_id: 'fixture-playlist',
      name: 'Fixture playlist',
      description: null,
      cover_hash_sha256: null,
      cover_object_key: null,
      cover_file_name: null,
      smart_rules: null,
      track_hashes: [track.content_hash_sha256.toUpperCase()],
      created_at: 1,
      updated_at: 1,
    },
  };
  const manifest = {
    schema_version: 2 as const,
    app: 'TON' as const,
    created_at: 1,
    updated_at: 2,
    writer_device_id: 'fixture',
    revision: 'revision-stable',
    max_counter: 14,
    tracks: [track],
    playlists: [playlist],
  };

  const delta = selectMobileCloudApplyDeltaFromState(manifest, {
    mirror: new Map([
      [`track:${track.content_hash_sha256}`, JSON.stringify(track)],
      [`playlist:${playlist.cloud_id}`, JSON.stringify(playlist)],
    ]),
    localTrackArtworkByHash: new Map([[track.content_hash_sha256, null]]),
    localPlaylistCoverByCloudId: new Map([[playlist.cloud_id, null]]),
    failedTrackHashes: new Set(),
  });

  assert.equal(delta.tracks.length, 0);
  assert.equal(delta.playlists.length, 0);
});

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

test('mobile local exclusion migration keeps delete local and clears it on re-import', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE cloud_sync_control (
        id INTEGER PRIMARY KEY,
        generation INTEGER NOT NULL DEFAULT 0,
        suppress_outbox INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO cloud_sync_control(id) VALUES (1);
      CREATE TABLE tracks (
        id INTEGER PRIMARY KEY, file_path TEXT, content_hash_sha256 TEXT,
        file_size INTEGER, title TEXT, artist TEXT, album TEXT, album_artist TEXT,
        track_number INTEGER, disc_number INTEGER, duration_ms INTEGER, genre TEXT,
        year INTEGER, bitrate INTEGER, sample_rate INTEGER, format TEXT,
        cover_art_path TEXT, loudness_lufs REAL, loudness_gain REAL,
        youtube_id TEXT, spotify_id TEXT, soundcloud_id TEXT, source_url TEXT,
        rating INTEGER, downloaded_at INTEGER
      );
      CREATE TABLE playlists (id INTEGER PRIMARY KEY);
      CREATE TABLE playlist_tracks (playlist_id INTEGER, track_id INTEGER);
      CREATE TABLE cloud_sync_outbox (
        scope_id TEXT NOT NULL DEFAULT '', entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL, local_id INTEGER, operation TEXT NOT NULL,
        payload_json TEXT, generation INTEGER NOT NULL, created_at INTEGER,
        PRIMARY KEY(scope_id, entity_type, entity_key)
      );
    `);
    const adapter = {
      execAsync: async (sql: string) => { db.exec(sql); },
      getAllAsync: async (sql: string) => db.prepare(sql).all(),
    } as never;
    await migrate016(adapter);
    db.prepare("UPDATE cloud_sync_control SET active_scope_id = 'mobile-scope' WHERE id = 1").run();
    const hash = 'a'.repeat(64);
    const id = Number(db.prepare(`
      INSERT INTO tracks(file_path, content_hash_sha256, title)
      VALUES ('/music/first.m4a', ?, 'First')
    `).run(hash).lastInsertRowid);
    db.prepare('DELETE FROM cloud_sync_outbox').run();
    db.prepare('DELETE FROM tracks WHERE id = ?').run(id);

    assert.deepEqual(
      db.prepare('SELECT scope_id, content_hash_sha256 FROM cloud_sync_local_exclusions').get(),
      { scope_id: 'mobile-scope', content_hash_sha256: hash },
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox').get() as { count: number }).count,
      0,
    );

    db.prepare(`
      INSERT INTO tracks(file_path, content_hash_sha256, title)
      VALUES ('/music/reimported.m4a', ?, 'Reimported')
    `).run(hash);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM cloud_sync_local_exclusions').get() as { count: number }).count,
      0,
    );
  } finally {
    db.close();
  }
});
