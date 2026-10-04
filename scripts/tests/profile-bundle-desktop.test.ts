import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { parseProfileBundle, type ProfileSessionRecord } from '../../packages/core/src/index.ts';
import { createSchema } from '../../packages/desktop/src-main/services/database/schema.ts';
import { migrateSchema } from '../../packages/desktop/src-main/services/database/migrations.ts';
import { readDesktopProfileRecords, saveDesktopProfileRecord } from '../../packages/desktop/src-main/services/listening-profile/store.ts';
import { applyDesktopProfile, collectDesktopProfile } from '../../packages/desktop/src-main/services/profile-bundle/index.ts';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  migrateSchema(db);
  return db;
}

/** The row shapes below are fixed by the schema this test creates, so the casts are about what the test itself selects. */
function first<T>(db: Database.Database, sql: string, ...args: unknown[]): T | undefined {
  const row: unknown = db.prepare(sql).get(...args);
  return row === undefined ? undefined : (row as T);
}
function all<T>(db: Database.Database, sql: string, ...args: unknown[]): T[] {
  const rows: unknown = db.prepare(sql).all(...args);
  return rows as T[];
}
const setSetting = (db: Database.Database, key: string, value: string) => db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run(key, value);
const getSetting = (db: Database.Database, key: string): string | undefined => first<{ value: string }>(db, 'SELECT value FROM settings WHERE key=?', key)?.value;
const addTrack = (db: Database.Database, title: string, hashes: { content?: string; file?: string }, rating: number | null = null): number => Number(db.prepare(`
  INSERT INTO tracks (file_path, title, artist, duration_ms, rating, content_hash_sha256, file_hash) VALUES (?, ?, 'Artist', 180000, ?, ?, ?)
`).run(`/music/${title}.mp3`, title, rating, hashes.content ?? null, hashes.file ?? null).lastInsertRowid);
const rating = (db: Database.Database, id: number): number | null => first<{ rating: number | null }>(db, 'SELECT rating FROM tracks WHERE id=?', id)?.rating ?? null;
const count = (db: Database.Database, sql: string, ...args: unknown[]): number => first<{ n: number }>(db, sql, ...args)?.n ?? -1;

function session(deviceId: string, id: string, listened = 5000): ProfileSessionRecord {
  const start = 1_700_000_000_000;
  return {
    device: { device_id: deviceId, name: 'Source PC', platform: 'windows' },
    session_id: id, track_id: 1, identity: 'sha256:c1', title: 'One', artist: 'Artist', album: null, genre: null, duration_ms: 180000,
    started_at: start, ended_at: start + listened, listened_ms: listened, completed: false, version: 2,
    intervals: [{ interval_id: id + '-i', session_id: id, device_id: deviceId, started_at: start, ended_at: start + listened, listened_ms: listened,
      volume_percent: 40, system_volume_percent: null, muted: false, playback_rate: 1, shuffle: false, repeat: 'off' }],
    observations: [],
  };
}

const SOURCE_SECRETS = {
  cloud_r2_config: '{"accountId":"SRC-ACCOUNT","bucket":"SRC-BUCKET"}',
  cloud_r2_secret_access_key: '{"mode":"safeStorage","value":"SRC-SECRET-BLOB"}',
  spotify_client_id: 'SRC-SPOTIFY-ID',
  spotify_client_secret: 'SRC-SPOTIFY-SECRET',
  download_directory: 'C:/SRC/Downloads',
  library_directories: '["C:/SRC/Music"]',
};
const TARGET_SECRETS = {
  cloud_r2_config: '{"accountId":"DST-ACCOUNT","bucket":"DST-BUCKET"}',
  cloud_r2_secret_access_key: '{"mode":"safeStorage","value":"DST-SECRET-BLOB"}',
  spotify_client_id: 'DST-SPOTIFY-ID',
  spotify_client_secret: 'DST-SPOTIFY-SECRET',
  download_directory: 'D:/DST/Downloads',
  library_directories: '["D:/DST/Music"]',
};

function source() {
  const db = openDb();
  for (const [key, value] of Object.entries(SOURCE_SECRETS)) setSetting(db, key, value);
  setSetting(db, 'volume_percent', '37');
  setSetting(db, 'language', 'cs');
  setSetting(db, 'eq_preset', 'bass');
  const one = addTrack(db, 'One', { content: 'c1', file: 'f1' }, 1);
  const two = addTrack(db, 'Two', {}, 1); // starred, but with no hash it cannot be recognised elsewhere
  const three = addTrack(db, 'Three', { content: 'c3', file: 'f3' });
  const road = Number(db.prepare("INSERT INTO playlists (name, description) VALUES ('Road', 'for driving')").run().lastInsertRowid);
  for (const [position, trackId] of [one, three, two].entries()) db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,?)').run(road, trackId, position);
  db.prepare("INSERT INTO playlists (name, is_smart, smart_rules) VALUES ('Smart', 1, '{\"x\":1}')").run();
  saveDesktopProfileRecord(db, session('desk-src', 's1'));
  saveDesktopProfileRecord(db, session('desk-src', 's2', 7000));
  return { db, one, two, three };
}

function target() {
  const db = openDb();
  for (const [key, value] of Object.entries(TARGET_SECRETS)) setSetting(db, key, value);
  setSetting(db, 'volume_percent', '90');
  setSetting(db, 'language', 'en');
  const one = addTrack(db, 'One (other copy)', { content: 'c1', file: 'other-file-hash' });
  const other = addTrack(db, 'Other', { content: 'cx', file: 'fx' }, 1);
  const existing = Number(db.prepare("INSERT INTO playlists (name) VALUES ('Existing')").run().lastInsertRowid);
  db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?,?,0)').run(existing, other);
  return { db, one, other };
}

test('exporting writes the portable data and none of the secrets', () => {
  const { db } = source();
  const { bundle, unidentifiedStars, unidentifiedPlaylistTracks } = collectDesktopProfile(db, { deviceName: 'Source PC', now: 1_700_000_100_000 });
  const text = JSON.stringify(bundle);
  for (const value of Object.values(SOURCE_SECRETS)) assert.equal(text.includes(value), false, 'a secret reached the file: ' + value);
  for (const key of Object.keys(SOURCE_SECRETS)) assert.equal(text.includes(key), false, 'a secret key name reached the file: ' + key);
  assert.equal(text.includes('listening_profile_device'), false);
  assert.deepEqual(bundle.settings, { eq_preset: 'bass', language: 'cs', volume_percent: '37' });
  assert.deepEqual(bundle.starred, ['sha256:c1']);
  assert.equal(unidentifiedStars, 1, 'the starred song without a hash must be reported');
  assert.equal(bundle.playlists.length, 2);
  const road = bundle.playlists.find((playlist) => playlist.name === 'Road');
  assert.deepEqual(road?.track_hashes, ['sha256:c1', 'sha256:c3'], 'playlist order must be kept and the song without a hash left out');
  assert.equal(road?.description, 'for driving');
  assert.equal(unidentifiedPlaylistTracks, 1);
  assert.equal(bundle.listening.length, 2);
  parseProfileBundle(text);
});

test('importing into another database restores the profile, merges, and leaves the target secrets alone', () => {
  const exported = collectDesktopProfile(source().db, { deviceName: 'Source PC' });
  const parsed = parseProfileBundle(JSON.stringify(exported.bundle));
  const { db, one, other } = target();
  const result = applyDesktopProfile(db, parsed);

  assert.equal(getSetting(db, 'volume_percent'), '37');
  assert.equal(getSetting(db, 'language'), 'cs');
  assert.equal(getSetting(db, 'eq_preset'), 'bass');
  for (const [key, value] of Object.entries(TARGET_SECRETS)) assert.equal(getSetting(db, key), value, key + ' of the target changed');

  assert.equal(rating(db, one), 1, 'the star must be restored on the matching song, whatever its file name or file hash');
  assert.equal(rating(db, other), 1, 'a star the target already had must stay');
  assert.equal(result.starred, 1);

  const playlists = all<{ id: number; name: string; description: string | null; is_smart: number; smart_rules: string | null }>(db, 'SELECT id, name, description, is_smart, smart_rules FROM playlists ORDER BY name');
  assert.deepEqual(playlists.map((playlist) => playlist.name), ['Existing', 'Road', 'Smart']);
  const road = playlists.find((playlist) => playlist.name === 'Road')!;
  assert.equal(road.description, 'for driving');
  assert.deepEqual(all<{ track_id: number }>(db, 'SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position', road.id).map((row) => row.track_id), [one]);
  assert.equal(result.playlistsCreated, 2);
  assert.equal(result.playlistTracksMissing, 1, 'the song this library does not have must be reported, not invented');
  const smart = playlists.find((playlist) => playlist.name === 'Smart')!;
  assert.equal(smart.is_smart, 1);
  assert.equal(smart.smart_rules, '{"x":1}');
  const existing = playlists.find((playlist) => playlist.name === 'Existing')!;
  assert.equal(count(db, 'SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id=?', existing.id), 1, 'an existing playlist must not be touched');

  const records = readDesktopProfileRecords(db, 'desk-src');
  assert.deepEqual(records.map((record) => record.session_id).sort(), ['s1', 's2']);
  assert.equal(result.sessions, 2);
});

test('importing the same file twice changes nothing the second time', () => {
  const parsed = parseProfileBundle(JSON.stringify(collectDesktopProfile(source().db, { deviceName: 'Source PC' }).bundle));
  const { db } = target();
  applyDesktopProfile(db, parsed);
  const counts = () => ({
    playlists: count(db, 'SELECT COUNT(*) AS n FROM playlists'),
    members: count(db, 'SELECT COUNT(*) AS n FROM playlist_tracks'),
    sessions: count(db, 'SELECT COUNT(*) AS n FROM profile_sessions'),
  });
  const before = counts();
  const again = applyDesktopProfile(db, parsed);
  assert.deepEqual(counts(), before);
  assert.equal(again.playlistsCreated, 0);
  assert.equal(again.playlistsSkipped, 2);
  assert.equal(again.sessions, 0);
  assert.equal(again.starred, 0);
});

test('a tampered file cannot overwrite the secrets, paths or device of the database it is imported into', () => {
  const exported = JSON.parse(JSON.stringify(collectDesktopProfile(source().db, { deviceName: 'Source PC' }).bundle));
  exported.settings.cloud_r2_secret_access_key = 'EVIL';
  exported.settings.spotify_client_secret = 'EVIL';
  exported.settings.download_directory = 'C:/Windows';
  exported.settings.listening_profile_device = '{"device_id":"hijack"}';
  exported.settings.cloud_r2_device_id = 'hijack';
  const parsed = parseProfileBundle(JSON.stringify(exported));
  const { db } = target();
  const deviceBefore = getSetting(db, 'listening_profile_device');
  applyDesktopProfile(db, parsed);
  for (const [key, value] of Object.entries(TARGET_SECRETS)) assert.equal(getSetting(db, key), value, key + ' was overwritten');
  assert.equal(getSetting(db, 'cloud_r2_device_id'), undefined);
  assert.equal(getSetting(db, 'listening_profile_device'), deviceBefore);
});

test('restoring on the device the data came from brings back what was lost and never removes anything', () => {
  const { db, one } = source();
  const parsed = parseProfileBundle(JSON.stringify(collectDesktopProfile(db, { deviceName: 'Source PC' }).bundle));
  db.prepare("DELETE FROM profile_sessions WHERE session_id='s2'").run();
  db.prepare('UPDATE tracks SET rating=NULL WHERE id=?').run(one);
  setSetting(db, 'volume_percent', '5');
  const extra = Number(db.prepare("INSERT INTO playlists (name) VALUES ('Made later')").run().lastInsertRowid);
  const result = applyDesktopProfile(db, parsed);
  assert.deepEqual(readDesktopProfileRecords(db, 'desk-src').map((record) => record.session_id).sort(), ['s1', 's2']);
  assert.equal(rating(db, one), 1);
  assert.equal(getSetting(db, 'volume_percent'), '37');
  assert.ok(db.prepare('SELECT 1 FROM playlists WHERE id=?').get(extra), 'a playlist made after the export must survive the import');
  assert.equal(result.sessions, 1);
  assert.equal(result.playlistsSkipped, 2, 'playlists that already exist are left as they are');
});
