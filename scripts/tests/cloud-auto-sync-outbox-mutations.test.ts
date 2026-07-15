import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createEmptyCloudLibraryManifestV2 } from '../../packages/core/src/services/cloud-sync/manifest-records.ts';
import { deriveDesktopCloudApplyProtection } from '../../packages/desktop/src-main/services/cloud-sync/apply-protection.ts';
import { createV2MutationBuilder } from '../../packages/desktop/src-main/services/cloud-sync/v2-mutations.ts';
import { createCloudAutoSyncSchema } from '../../packages/desktop/src-main/services/database/cloud-auto-sync-schema.ts';
import { createSchema } from '../../packages/desktop/src-main/services/database/schema.ts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  createCloudAutoSyncSchema(db);
  return db;
}

test('track identity replacement updates the live track without deleting the old cloud hash', () => {
  const db = createTestDatabase();
  try {
    const trackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES (?, ?, ?)
    `).run('/music/a.mp3', HASH_A, 'A').lastInsertRowid);
    db.prepare('DELETE FROM cloud_sync_outbox').run();
    const before = db.prepare('SELECT generation FROM cloud_sync_control WHERE id = 1')
      .get() as { generation: number };

    db.prepare('UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?').run(HASH_B, trackId);

    const control = db.prepare('SELECT generation FROM cloud_sync_control WHERE id = 1')
      .get() as { generation: number };
    assert.equal(control.generation, before.generation + 1);
    const rows = db.prepare(`
      SELECT entity_key, local_id, operation, payload_json, generation
      FROM cloud_sync_outbox ORDER BY entity_key
    `).all() as Array<{
      entity_key: string;
      local_id: number | null;
      operation: string;
      payload_json: string | null;
      generation: number;
    }>;
    assert.deepEqual(rows.map((row) => [row.entity_key, row.operation]), [
      [String(trackId), 'upsert'],
    ]);
    assert.equal(rows[0]?.local_id, trackId);
    assert.ok(rows.every((row) => row.generation === control.generation));
  } finally {
    db.close();
  }
});
test('track hash replacement enqueues every containing playlist in the same generation', () => {
  const db = createTestDatabase();
  try {
    const trackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES (?, ?, ?)
    `).run('/music/a.mp3', HASH_A, 'A').lastInsertRowid);
    const firstPlaylistId = Number(db.prepare(`
      INSERT INTO playlists (name) VALUES ('First')
    `).run().lastInsertRowid);
    const secondPlaylistId = Number(db.prepare(`
      INSERT INTO playlists (name) VALUES ('Second')
    `).run().lastInsertRowid);
    db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, 0), (?, ?, 0), (?, ?, 1)
    `).run(
      firstPlaylistId, trackId,
      secondPlaylistId, trackId,
      secondPlaylistId, trackId,
    );
    db.prepare('DELETE FROM cloud_sync_outbox').run();

    db.prepare('UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?').run(HASH_B, trackId);

    const control = db.prepare('SELECT generation FROM cloud_sync_control WHERE id = 1')
      .get() as { generation: number };
    const rows = db.prepare(`
      SELECT entity_type, entity_key, local_id, operation, generation
      FROM cloud_sync_outbox
      ORDER BY entity_type, entity_key
    `).all() as Array<{
      entity_type: string;
      entity_key: string;
      local_id: number | null;
      operation: string;
      generation: number;
    }>;
    const playlistRows = rows.filter((row) => row.entity_type === 'playlist');
    assert.deepEqual(
      playlistRows.map((row) => row.local_id).sort((left, right) => (left ?? 0) - (right ?? 0)),
      [firstPlaylistId, secondPlaylistId],
    );
    assert.ok(playlistRows.every((row) => row.operation === 'upsert'));
    assert.ok(rows.every((row) => row.generation === control.generation));
  } finally {
    db.close();
  }
});

test('playlist cascades preserve a durable cloud-id tombstone instead of an upsert echo', () => {
  const db = createTestDatabase();
  try {
    const trackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES (?, ?, ?)
    `).run('/music/a.mp3', HASH_A, 'A').lastInsertRowid);
    const playlistId = Number(db.prepare(`
      INSERT INTO playlists (name) VALUES ('Playlist')
    `).run().lastInsertRowid);
    const playlist = db.prepare('SELECT cloud_id FROM playlists WHERE id = ?')
      .get(playlistId) as { cloud_id: string };
    assert.match(playlist.cloud_id, /^playlist-[a-f0-9]{32}$/);
    db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, 0)
    `).run(playlistId, trackId);
    db.prepare('DELETE FROM cloud_sync_outbox').run();

    db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);

    const rows = db.prepare(`
      SELECT entity_type, entity_key, operation, payload_json
      FROM cloud_sync_outbox
    `).all() as Array<{
      entity_type: string;
      entity_key: string;
      operation: string;
      payload_json: string | null;
    }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.entity_type, 'playlist');
    assert.equal(rows[0]?.entity_key, `cloud:${playlist.cloud_id}`);
    assert.equal(rows[0]?.operation, 'delete');
    assert.equal(JSON.parse(rows[0]?.payload_json ?? '{}').cloud_id, playlist.cloud_id);
  } finally {
    db.close();
  }
});

test('local track delete stays local while playlist deletion remains synchronized', () => {
  const db = createTestDatabase();
  try {
    const oldTrackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES ('/music/old.mp3', ?, 'Old')
    `).run(HASH_A).lastInsertRowid);
    const oldPlaylistId = Number(db.prepare(`
      INSERT INTO playlists (cloud_id, name) VALUES ('playlist-old-id', 'Old')
    `).run().lastInsertRowid);
    db.prepare('DELETE FROM cloud_sync_outbox').run();

    db.prepare('DELETE FROM tracks WHERE id = ?').run(oldTrackId);
    db.prepare('DELETE FROM playlists WHERE id = ?').run(oldPlaylistId);
    const newTrackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES ('/music/new.mp3', ?, 'New')
    `).run(HASH_B).lastInsertRowid);
    const newPlaylistId = Number(db.prepare(`
      INSERT INTO playlists (cloud_id, name) VALUES ('playlist-new-id', 'New')
    `).run().lastInsertRowid);

    assert.equal(newTrackId, oldTrackId);
    assert.equal(newPlaylistId, oldPlaylistId);
    const rows = db.prepare(`
      SELECT entity_type, entity_key, operation, payload_json
      FROM cloud_sync_outbox ORDER BY entity_type, entity_key
    `).all() as Array<{
      entity_type: string;
      entity_key: string;
      operation: string;
      payload_json: string | null;
    }>;
    assert.ok(!rows.some((row) => (
      row.entity_type === 'track'
      && row.operation === 'delete'
    )));
    assert.ok(rows.some((row) => (
      row.entity_type === 'track'
      && row.entity_key === String(newTrackId)
      && row.operation === 'upsert'
    )));
    assert.ok(rows.some((row) => (
      row.entity_type === 'playlist'
      && row.entity_key === 'cloud:playlist-old-id'
      && row.operation === 'delete'
      && JSON.parse(row.payload_json ?? '{}').cloud_id === 'playlist-old-id'
    )));
    assert.ok(rows.some((row) => (
      row.entity_type === 'playlist'
      && row.entity_key === String(newPlaylistId)
      && row.operation === 'upsert'
    )));
  } finally {
    db.close();
  }
});

test('deleting a local track suppresses its cascade without changing cloud playlist state', () => {
  const db = createTestDatabase();
  try {
    const trackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES ('/music/local.mp3', ?, 'Local')
    `).run(HASH_A).lastInsertRowid);
    const playlistId = Number(db.prepare(`
      INSERT INTO playlists (cloud_id, name) VALUES ('playlist-local', 'Local')
    `).run().lastInsertRowid);
    db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, 0)
    `).run(playlistId, trackId);
    db.prepare('DELETE FROM cloud_sync_outbox').run();
    const before = db.prepare('SELECT generation FROM cloud_sync_control WHERE id = 1')
      .get() as { generation: number };

    db.prepare('DELETE FROM tracks WHERE id = ?').run(trackId);

    const control = db.prepare(`
      SELECT generation, suppress_outbox FROM cloud_sync_control WHERE id = 1
    `).get() as { generation: number; suppress_outbox: number };
    const pending = db.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox')
      .get() as { count: number };
    const memberships = db.prepare('SELECT COUNT(*) AS count FROM playlist_tracks')
      .get() as { count: number };
    assert.equal(pending.count, 0);
    assert.equal(memberships.count, 0);
    assert.equal(control.generation, before.generation);
    assert.equal(control.suppress_outbox, 0);
  } finally {
    db.close();
  }
});

test('schema refresh discards track tombstones queued by older builds', () => {
  const db = createTestDatabase();
  try {
    db.prepare(`
      INSERT INTO cloud_sync_outbox (
        scope_id, entity_type, entity_key, operation, payload_json, generation
      ) VALUES ('scope', 'track', ?, 'delete', ?, 1)
    `).run(`hash:${HASH_A}`, JSON.stringify({ content_hash_sha256: HASH_A }));

    createCloudAutoSyncSchema(db);

    const pending = db.prepare(`
      SELECT COUNT(*) AS count FROM cloud_sync_outbox
      WHERE entity_type = 'track' AND operation = 'delete'
    `).get() as { count: number };
    assert.equal(pending.count, 0);
  } finally {
    db.close();
  }
});

test('normal desktop sync ignores stale track tombstones', () => {
  const remote = createEmptyCloudLibraryManifestV2('remote');
  const desktopDelete = {
    id: 1,
    scope_id: 'scope',
    entity_type: 'track' as const,
    entity_key: `hash:${HASH_A}`,
    local_id: null,
    operation: 'delete' as const,
    payload_json: JSON.stringify({ content_hash_sha256: HASH_A }),
    generation: 1,
  };
  const desktop = createV2MutationBuilder({
    state: {
      scope_id: 'scope', revision: null, etag: null, lamport_counter: 0,
      last_success_at: null, last_error: null, next_retry_at: null,
      needs_full_reconcile: 0, pending_remote_revision: null, pending_downloads: 0,
      last_commit_cleanup_at: null, activation_marker_confirmed: 1,
    },
    deviceId: 'desktop',
    outbox: [desktopDelete],
    tracks: new Map(),
    playlists: new Map(),
    bootstrappingFromV1: false,
    repairReferencedBlobs: false,
  }).build(remote);
  assert.deepEqual(desktop.tracks, []);
});
