import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { selectCoverRepairCandidates as selectDesktopCandidates } from '../../packages/desktop/src-main/services/cloud-sync/cover-repair-candidates.ts';
import { createCloudAutoSyncSchema } from '../../packages/desktop/src-main/services/database/cloud-auto-sync-schema.ts';
import { createSchema } from '../../packages/desktop/src-main/services/database/schema.ts';
import { findActiveDownloadId } from '../../packages/desktop/src-main/services/download-queue/active-download.ts';
import { selectCoverRepairCandidates as selectPhoneCandidates } from '../../packages/mobile/src/services/cloud-sync/cover-repair-candidates.ts';
import { runMigrations } from '../../packages/mobile/src/services/migrations/index.ts';

const SCOPE = 'scope-1';

/** Songs in every state the cover repair has to tell apart; the same set runs on the desktop and the phone schema. */
const SONGS = [
  { key: 'local-cover-r2-without', cover: '/art/a.jpg', youtube: 'yt-a', published: 'no-art' },
  { key: 'no-cover-r2-without', cover: null, youtube: 'yt-b', published: 'no-art' },
  { key: 'no-cover-r2-has', cover: null, youtube: 'yt-c', published: 'art' },
  { key: 'no-cover-unpublished', cover: null, youtube: 'yt-d', published: null },
  { key: 'no-cover-not-youtube', cover: null, youtube: null, published: 'no-art' },
  { key: 'local-cover-r2-has', cover: '/art/f.jpg', youtube: 'yt-f', published: 'art' },
] as const;

function hashOf(index: number): string {
  return String(index + 1).repeat(64).slice(0, 64);
}

function recordJson(hash: string, withArtwork: boolean): string {
  return JSON.stringify({
    content_hash_sha256: hash,
    deleted: false,
    entry: { artwork_object_key: withArtwork ? `ton/objects/artwork/${hash}.jpg` : null },
  });
}

function namesOf(ids: number[], idsByKey: Map<string, number>): string[] {
  return [...idsByKey].filter(([, id]) => ids.includes(id)).map(([key]) => key).sort();
}

test('desktop cover repair picks songs whose cover R2 lacks, on the real desktop schema', () => {
  const db = new Database(':memory:');
  try {
    createSchema(db);
    createCloudAutoSyncSchema(db);
    const idsByKey = new Map<string, number>();
    SONGS.forEach((song, index) => {
      const hash = hashOf(index);
      idsByKey.set(song.key, Number(db.prepare(
        'INSERT INTO tracks (file_path, content_hash_sha256, title, cover_art_path, youtube_id) VALUES (?, ?, ?, ?, ?)',
      ).run(`/music/${song.key}.m4a`, hash, song.key, song.cover, song.youtube).lastInsertRowid));
      if (song.published) {
        db.prepare(
          'INSERT INTO cloud_sync_entities (scope_id, entity_type, entity_key, record_json) VALUES (?, ?, ?, ?)',
        ).run(SCOPE, 'track', hash, recordJson(hash, song.published === 'art'));
      }
    });

    const candidates = selectDesktopCandidates(db, SCOPE);
    assert.deepEqual(namesOf(candidates.republish.map((row) => row.id), idsByKey), ['local-cover-r2-without']);
    assert.deepEqual(
      namesOf(candidates.backfill.map((row) => row.id), idsByKey),
      ['no-cover-r2-without', 'no-cover-unpublished'],
    );
  } finally {
    db.close();
  }
});

test('phone cover repair picks the same songs on the real phone schema', async () => {
  const db = new Database(':memory:');
  const params = (values: unknown[]) => (values.length === 1 && Array.isArray(values[0]) ? values[0] : values);
  const phoneDb = {
    execAsync: async (sql: string) => { db.exec(sql); },
    getFirstAsync: async (sql: string, ...values: unknown[]) => db.prepare(sql).get(...params(values)),
    getAllAsync: async (sql: string, ...values: unknown[]) => db.prepare(sql).all(...params(values)),
    runAsync: async (sql: string, ...values: unknown[]) => {
      const result = db.prepare(sql).run(...params(values));
      return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
  try {
    await runMigrations(phoneDb as never);
    db.prepare('UPDATE cloud_sync_control SET active_scope_id = ? WHERE id = 1').run(SCOPE);
    const idsByKey = new Map<string, number>();
    SONGS.forEach((song, index) => {
      const hash = hashOf(index);
      idsByKey.set(song.key, Number(db.prepare(
        'INSERT INTO tracks (file_path, content_hash_sha256, title, cover_art_path, youtube_id) VALUES (?, ?, ?, ?, ?)',
      ).run(`file:///music/${song.key}.m4a`, hash, song.key, song.cover, song.youtube).lastInsertRowid));
      if (song.published) {
        db.prepare(
          `INSERT INTO cloud_sync_entities (scope_id, entity_type, entity_key, version_counter, version_device_id, record_json)
           VALUES (?, ?, ?, 1, 'desktop', ?)`,
        ).run(SCOPE, 'track', hash, recordJson(hash, song.published === 'art'));
      }
    });

    const candidates = await selectPhoneCandidates(phoneDb as never);
    assert.deepEqual(namesOf(candidates.republish.map((row) => row.id), idsByKey), ['local-cover-r2-without']);
    assert.deepEqual(
      namesOf(candidates.backfill.map((row) => row.id), idsByKey),
      ['no-cover-r2-without', 'no-cover-unpublished'],
    );
  } finally {
    db.close();
  }
});

test('desktop: a song already queued or downloading is found, so a second Download click reuses it', () => {
  const db = new Database(':memory:');
  try {
    createSchema(db);
    const insert = db.prepare(
      "INSERT INTO download_queue (url, source, source_id, title, format, status) VALUES (?, 'youtube', ?, ?, 'm4a', ?)",
    );
    const queued = Number(insert.run('https://youtu.be/a', 'video-a', 'A', 'downloading').lastInsertRowid);
    insert.run('https://youtu.be/b', 'video-b', 'B', 'done');
    const request = (sourceId: string) => ({ source: 'youtube' as const, source_id: sourceId, url: `https://youtu.be/${sourceId}` });

    assert.equal(findActiveDownloadId(db, request('video-a')), queued);
    assert.equal(findActiveDownloadId(db, request('video-b')), null, 'a finished download can be downloaded again');
    assert.equal(findActiveDownloadId(db, request('video-c')), null);
  } finally {
    db.close();
  }
});
