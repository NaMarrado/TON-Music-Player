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
