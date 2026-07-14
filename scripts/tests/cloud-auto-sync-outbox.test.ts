import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { deriveDesktopCloudApplyProtection } from '../../packages/desktop/src-main/services/cloud-sync/apply-protection.ts';
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

test('track identity replacement emits one generation with a live upsert and old-hash tombstone', () => {
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
      [`hash:${HASH_A}`, 'delete'],
    ]);
    assert.equal(rows[0]?.local_id, trackId);
    assert.equal(JSON.parse(rows[1]?.payload_json ?? '{}').content_hash_sha256, HASH_A);
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

test('delete then reused numeric ID preserves old track and playlist tombstones', () => {
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
    assert.ok(rows.some((row) => (
      row.entity_type === 'track'
      && row.entity_key === `hash:${HASH_A}`
      && row.operation === 'delete'
      && JSON.parse(row.payload_json ?? '{}').content_hash_sha256 === HASH_A
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

test('cloud apply suppression prevents an echo outbox mutation', () => {
  const db = createTestDatabase();
  try {
    db.prepare('UPDATE cloud_sync_control SET suppress_outbox = 1 WHERE id = 1').run();
    db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES (?, ?, ?)
    `).run('/music/cloud.mp3', HASH_A, 'Cloud');
    db.prepare(`
      INSERT INTO playlists (cloud_id, name)
      VALUES ('playlist-cloud', 'Cloud Playlist')
    `).run();
    const count = db.prepare('SELECT COUNT(*) AS count FROM cloud_sync_outbox')
      .get() as { count: number };
    assert.equal(count.count, 0);
  } finally {
    db.close();
  }
});

test('newer outbox generations protect both old and current cloud identities from apply', () => {
  const db = createTestDatabase();
  try {
    const trackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES (?, ?, ?)
    `).run('/music/a.mp3', HASH_A, 'A').lastInsertRowid);
    const playlistId = Number(db.prepare(`
      INSERT INTO playlists (cloud_id, name) VALUES ('playlist-old', 'Playlist')
    `).run().lastInsertRowid);
    db.prepare('DELETE FROM cloud_sync_outbox').run();
    const captured = db.prepare('SELECT generation FROM cloud_sync_control WHERE id = 1')
      .get() as { generation: number };

    db.prepare('UPDATE tracks SET content_hash_sha256 = ?, title = ? WHERE id = ?')
      .run(HASH_B, 'Edited during upload', trackId);
    db.prepare('UPDATE playlists SET cloud_id = ?, name = ? WHERE id = ?')
      .run('playlist-current', 'Edited during upload', playlistId);

    const entries = db.prepare(`
      SELECT entity_type, local_id, operation, payload_json
      FROM cloud_sync_outbox
      WHERE generation > ?
      ORDER BY generation, id
    `).all(captured.generation) as Array<{
      entity_type: 'track' | 'playlist' | 'library';
      local_id: number | null;
      operation: 'upsert' | 'delete' | 'reconcile';
      payload_json: string | null;
    }>;
    const trackLookup = db.prepare('SELECT content_hash_sha256 FROM tracks WHERE id = ?');
    const playlistLookup = db.prepare('SELECT cloud_id FROM playlists WHERE id = ?');
    const protection = deriveDesktopCloudApplyProtection(entries, {
      trackHash: (id) => (trackLookup.get(id) as { content_hash_sha256: string } | undefined)
        ?.content_hash_sha256 ?? null,
      playlistCloudId: (id) => (playlistLookup.get(id) as { cloud_id: string } | undefined)
        ?.cloud_id ?? null,
    });

    assert.deepEqual([...protection.trackHashes].sort(), [HASH_A, HASH_B]);
    assert.deepEqual(
      [...protection.playlistCloudIds].sort(),
      ['playlist-current', 'playlist-old'],
    );
    assert.equal(protection.protectAll, false);
  } finally {
    db.close();
  }
});

test('a newer reconcile protects the full local library from an older apply', () => {
  const protection = deriveDesktopCloudApplyProtection([{
    entity_type: 'library',
    local_id: null,
    operation: 'reconcile',
    payload_json: null,
  }], {
    trackHash: () => null,
    playlistCloudId: () => null,
  });
  assert.equal(protection.protectAll, true);
});

test('playlist membership and track delete-readd retain apply protection', () => {
  const db = createTestDatabase();
  try {
    const oldTrackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES ('/music/old.mp3', ?, 'Old')
    `).run(HASH_A).lastInsertRowid);
    const memberTrackId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES ('/music/member.mp3', ?, 'Member')
    `).run(HASH_B).lastInsertRowid);
    const playlistId = Number(db.prepare(`
      INSERT INTO playlists (cloud_id, name) VALUES ('playlist-members', 'Members')
    `).run().lastInsertRowid);
    db.prepare('DELETE FROM cloud_sync_outbox').run();

    db.prepare('DELETE FROM tracks WHERE id = ?').run(oldTrackId);
    const replacementId = Number(db.prepare(`
      INSERT INTO tracks (file_path, content_hash_sha256, title)
      VALUES ('/music/readded.mp3', ?, 'Re-added')
    `).run(HASH_A).lastInsertRowid);
    db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, position)
      VALUES (?, ?, 0)
    `).run(playlistId, memberTrackId);

    const entries = db.prepare(`
      SELECT entity_type, local_id, operation, payload_json
      FROM cloud_sync_outbox ORDER BY generation, id
    `).all() as Array<{
      entity_type: 'track' | 'playlist' | 'library';
      local_id: number | null;
      operation: 'upsert' | 'delete' | 'reconcile';
      payload_json: string | null;
    }>;
    const protection = deriveDesktopCloudApplyProtection(entries, {
      trackHash: (id) => (db.prepare('SELECT content_hash_sha256 FROM tracks WHERE id = ?')
        .get(id) as { content_hash_sha256: string } | undefined)?.content_hash_sha256 ?? null,
      playlistCloudId: (id) => (db.prepare('SELECT cloud_id FROM playlists WHERE id = ?')
        .get(id) as { cloud_id: string } | undefined)?.cloud_id ?? null,
    });

    assert.ok(replacementId !== oldTrackId);
    assert.ok(protection.trackHashes.has(HASH_A));
    assert.ok(protection.playlistCloudIds.has('playlist-members'));
  } finally {
    db.close();
  }
});
