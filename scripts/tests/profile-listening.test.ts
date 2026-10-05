import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import type { ListeningSessionSnapshot } from '../../packages/core/src/types/history.ts';
import { createSchema } from '../../packages/desktop/src-main/services/database/schema.ts';
import { migrateSchema } from '../../packages/desktop/src-main/services/database/migrations.ts';
import {
  getActiveListeningSession,
  getListeningProfileSummary,
  recordListeningSession,
} from '../../packages/desktop/src-main/handlers/profile-handler-data.ts';

function fixture(databasePath = ':memory:') {
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  createSchema(db);
  migrateSchema(db);
  const first = Number(db.prepare(`
    INSERT INTO tracks (file_path, title, artist, duration_ms, rating, play_count)
    VALUES ('/test/first.wav', 'First', 'Artist', 180000, 1, 9)
  `).run().lastInsertRowid);
  const second = Number(db.prepare(`
    INSERT INTO tracks (file_path, title, artist, duration_ms, rating)
    VALUES ('/test/second.wav', 'Second', 'Artist', 180000, NULL)
  `).run().lastInsertRowid);
  return { db, first, second };
}

function session(trackId: number, overrides: Partial<ListeningSessionSnapshot> = {}): ListeningSessionSnapshot {
  return {
    session_id: 'listening-session-one',
    track_id: trackId,
    started_at: 1_700_000_000_000,
    listened_ms: 2_500,
    completed: false,
    ended_at: null,
    ...overrides,
  };
}

test('legacy counts and history never fabricate measured listening totals', () => {
  const { db, first } = fixture();
  try {
    db.prepare('INSERT INTO play_history(track_id, duration_ms, completed) VALUES (?, 180000, 1)').run(first);
    recordListeningSession(db, session(first, { listened_ms: 0 }));
    const before = getListeningProfileSummary(db);
    assert.equal(before.total_plays, 9);
    assert.equal(before.total_listened_ms, 0);
    assert.equal(before.measurement_started_at, 0);
    assert.deepEqual(before.recent, []);

    recordListeningSession(db, session(first));
    const after = getListeningProfileSummary(db);
    assert.equal(after.total_plays, 10);
    assert.equal(after.total_listened_ms, 2_500);
    assert.equal(after.measurement_started_at, 1_700_000_000_000);
    assert.equal(after.recent[0]?.listened_ms, 2_500);
  } finally {
    db.close();
  }
});

test('duplicate and stale cumulative checkpoints cannot add time or count another play', () => {
  const { db, first } = fixture();
  try {
    recordListeningSession(db, session(first));
    recordListeningSession(db, session(first));
    recordListeningSession(db, session(first, { listened_ms: 1_000 }));
    recordListeningSession(db, session(first, { listened_ms: 6_000 }));
    const summary = getListeningProfileSummary(db);
    assert.equal(summary.total_plays, 10);
    assert.equal(summary.total_listened_ms, 6_000);
    assert.deepEqual(summary.recent.map((entry) => entry.listened_ms), [6_000]);
  } finally {
    db.close();
  }
});

test('terminal sessions stay closed and a genuine repeat counts separately', () => {
  const { db, first } = fixture();
  try {
    recordListeningSession(db, session(first, { completed: true, ended_at: 1_700_000_003_000 }));
    recordListeningSession(db, session(first, { listened_ms: 10_000 }));
    recordListeningSession(db, session(first, {
      session_id: 'listening-session-repeat',
      started_at: 1_700_000_005_000,
      listened_ms: 1_000,
    }));
    const summary = getListeningProfileSummary(db);
    assert.equal(summary.total_plays, 11);
    assert.equal(summary.total_listened_ms, 3_500);
    assert.deepEqual(summary.recent.map((entry) => [entry.listened_ms, entry.completed, entry.ended_at]), [
      [1_000, false, null],
      [2_500, true, 1_700_000_003_000],
    ]);
  } finally {
    db.close();
  }
});

test('restart resumes the persisted session without inventing downtime or recounting it', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ton-listening-test-'));
  const databasePath = path.join(directory, 'listening.db');
  let db: Database.Database | null = null;
  try {
    const initial = fixture(databasePath);
    db = initial.db;
    recordListeningSession(db, session(initial.first));
    db.close();
    db = null;
    db = new Database(databasePath);
    const restored = getActiveListeningSession(db, initial.first);
    assert.ok(restored);
    assert.deepEqual({ ...restored, device: undefined, intervals: undefined, observations: undefined }, { ...session(initial.first), device: undefined, intervals: undefined, observations: undefined });
    assert.equal(getActiveListeningSession(db, initial.second), null);
    recordListeningSession(db, { ...restored, listened_ms: 4_000 });
    const summary = getListeningProfileSummary(db);
    assert.equal(summary.total_listened_ms, 4_000);
    assert.equal(summary.total_plays, 10);
    assert.equal(summary.recent[0]?.session_id, 'listening-session-one');
    assert.equal(summary.recent[0]?.played_at, 1_700_000_000_000);
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('favorites include every positive rating and expose real per-song counts and playable tracks', () => {
  const { db, first, second } = fixture();
  try {
    db.prepare('UPDATE tracks SET rating = 5 WHERE id = ?').run(second);
    db.prepare(`INSERT INTO tracks(file_path, title, rating) VALUES ('/test/zero.wav', 'Zero', 0), ('/test/negative.wav', 'Negative', -1)`).run();
    recordListeningSession(db, session(second, { session_id: 'second-song' }));
    const summary = getListeningProfileSummary(db);
    assert.equal(summary.favorite_count, 2);
    assert.deepEqual(summary.favorites.map((track) => [track.id, track.rating, track.play_count, track.file_path]), [
      [first, 1, 9, '/test/first.wav'],
      [second, 5, 1, '/test/second.wav'],
    ]);
    assert.deepEqual(summary.most_played.map((track) => [track.id, track.play_count]), [[first, 9], [second, 1]]);
  } finally {
    db.close();
  }
});

test('measured lifetime listening survives deletion of a track and its detailed history', () => {
  const { db, first } = fixture();
  try {
    recordListeningSession(db, session(first));
    db.prepare('DELETE FROM tracks WHERE id = ?').run(first);
    const summary = getListeningProfileSummary(db);
    assert.equal(summary.total_listened_ms, 2_500);
    assert.equal(summary.measurement_started_at, 1_700_000_000_000);
    assert.deepEqual(summary.recent, []);
  } finally {
    db.close();
  }
});

test('a reused session identity cannot move its count or measured time to another song', () => {
  const { db, first, second } = fixture();
  try {
    recordListeningSession(db, session(first));
    assert.throws(() => recordListeningSession(db, session(second)), /identity cannot change/);
    const summary = getListeningProfileSummary(db);
    assert.equal(summary.total_listened_ms, 2_500);
    assert.equal(summary.total_plays, 10);
    assert.equal(summary.recent[0]?.track.id, first);
    assert.equal(db.prepare('SELECT play_count FROM tracks WHERE id = ?').get(second).play_count, 0);
  } finally {
    db.close();
  }
});

test('per-song counts remain available beyond a small most-played preview', () => {
  const { db, first } = fixture();
  try {
    const insert = db.prepare('INSERT INTO tracks(file_path, title, play_count) VALUES (?, ?, ?)');
    for (let index = 0; index < 25; index += 1) {
      insert.run(`/test/song-${index}.wav`, `Song ${index}`, index + 1);
    }
    const summary = getListeningProfileSummary(db);
    assert.equal(summary.most_played.find((track) => track.title === 'Song 0')?.play_count, 1);
    assert.equal(summary.most_played.find((track) => track.id === first)?.play_count, 9);
    assert.equal(summary.most_played[0]?.play_count, 25);
  } finally {
    db.close();
  }
});
