import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createSchema } from '../../packages/desktop/src-main/services/database/schema.ts';
import { addTracksToPlaylistAtomic } from '../../packages/desktop/src-main/handlers/playlist-handler/mutations/add-tracks-atomic.ts';
import {
  DESKTOP_UI_SCALE_DEFAULT,
  DESKTOP_UI_SCALE_MAX,
  DESKTOP_UI_SCALE_MIN,
  normalizeDesktopUiScale,
} from '../../packages/desktop/src/shared/ui-scale.ts';

function fixture() {
  const db = new Database(':memory:');
  createSchema(db);
  const playlistId = Number(db.prepare('INSERT INTO playlists(name) VALUES (?)').run('Test').lastInsertRowid);
  const first = Number(db.prepare('INSERT INTO tracks(file_path, title, artist) VALUES (?, ?, ?)').run('/tmp/a.m4a', 'A', 'Artist A').lastInsertRowid);
  const second = Number(db.prepare('INSERT INTO tracks(file_path, title, artist) VALUES (?, ?, ?)').run('/tmp/b.m4a', 'B', 'Artist B').lastInsertRowid);
  return { db, first, playlistId, second };
}

test('playlist addition inserts nothing until duplicates are approved', () => {
  const { db, first, playlistId, second } = fixture();
  try {
    addTracksToPlaylistAtomic(db, { playlistId, trackIds: [first] });
    const blocked = addTracksToPlaylistAtomic(db, { playlistId, trackIds: [first, second] });
    assert.equal(blocked.status, 'needs_confirmation');
    assert.equal(db.prepare('SELECT COUNT(*) count FROM playlist_tracks').get().count, 1);

    const added = addTracksToPlaylistAtomic(db, {
      playlistId,
      trackIds: [first, second],
      allowedDuplicateTrackIds: [first],
    });
    assert.deepEqual(added, { status: 'added', addedCount: 2 });
    assert.deepEqual(
      db.prepare('SELECT track_id FROM playlist_tracks ORDER BY position').all().map((row) => row.track_id),
      [first, first, second],
    );
  } finally {
    db.close();
  }
});

test('duplicate prompts preserve the current selection order', () => {
  const { db, first, playlistId, second } = fixture();
  try {
    addTracksToPlaylistAtomic(db, { playlistId, trackIds: [first, second] });
    const blocked = addTracksToPlaylistAtomic(db, {
      playlistId,
      trackIds: [second, first],
    });
    assert.equal(blocked.status, 'needs_confirmation');
    if (blocked.status === 'needs_confirmation') {
      assert.deepEqual(blocked.duplicates.map((track) => track.trackId), [second, first]);
    }
  } finally {
    db.close();
  }
});

test('desktop UI scale clamps and snaps persisted values', () => {
  assert.equal(normalizeDesktopUiScale('bad'), DESKTOP_UI_SCALE_DEFAULT);
  assert.equal(normalizeDesktopUiScale(10), DESKTOP_UI_SCALE_MIN);
  assert.equal(normalizeDesktopUiScale(999), DESKTOP_UI_SCALE_MAX);
  assert.equal(normalizeDesktopUiScale(113), 113);
});
