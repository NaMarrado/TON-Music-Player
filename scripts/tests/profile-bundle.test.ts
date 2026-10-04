import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROFILE_SETTING_KEYS,
  buildProfileBundle,
  parseProfileBundle,
  starIdentity,
  type ProfileBundleInput,
} from '../../packages/core/src/profile-bundle/index.ts';
import type { ProfileSessionRecord } from '../../packages/core/src/services/listening-profile/records.ts';

const SECRETS = {
  cloud_r2_config: '{"accountId":"acct","bucket":"my-private-bucket"}',
  cloud_r2_secret_access_key: '{"mode":"safeStorage","value":"TOP-SECRET-BLOB"}',
  cloud_r2_device_id: 'desktop-0000-1111',
  spotify_client_id: 'spotify-client-id-123',
  spotify_client_secret: 'spotify-client-secret-456',
  download_directory: 'C:/Users/me/Music',
  library_directories: '["C:/Users/me/Music"]',
  playback_session: '{"queue":[]}',
  listening_profile_device: '{"device_id":"x"}',
  listening_profile_active_session: 'ACTIVE-SESSION-MARKER-9f3',
  schema_version: 'SCHEMA-MARKER-77',
};
const PORTABLE = {
  language: 'cs',
  loudness_normalization: 'true',
  loudness_target: '-14',
  eq_enabled: 'true',
  eq_preset: 'bass',
  eq_bands: '[1,2,3,4,5,6,7,8,9,10]',
  frequency_enabled: 'false',
  frequency_hz: '432',
  download_quality_profile: 'best_compatible',
  volume_percent: '37',
};

function record(id = 'sess-1'): ProfileSessionRecord {
  return {
    device: { device_id: 'desk-1', name: 'My PC', platform: 'windows' },
    session_id: id,
    track_id: 5,
    identity: 'sha256:abc',
    title: 'Song',
    artist: 'Artist',
    album: null,
    genre: null,
    duration_ms: 200000,
    started_at: 1_700_000_000_000,
    ended_at: 1_700_000_005_000,
    listened_ms: 5000,
    completed: false,
    version: 3,
    intervals: [{
      interval_id: 'int-1', session_id: id, device_id: 'desk-1', started_at: 1_700_000_000_000, ended_at: 1_700_000_005_000, listened_ms: 5000,
      volume_percent: 40, system_volume_percent: null, muted: false, playback_rate: 1, shuffle: false, repeat: 'off',
    }],
    observations: [],
  };
}

function input(overrides: Partial<ProfileBundleInput> = {}): ProfileBundleInput {
  return {
    deviceName: 'My PC',
    platform: 'desktop',
    settings: { ...PORTABLE, ...SECRETS },
    starred: ['sha256:bbb', 'sha256:aaa', 'sha256:aaa'],
    playlists: [{ name: 'Road', description: null, is_smart: false, smart_rules: null, track_hashes: ['h1', 'h2'] }],
    listening: [record()],
    ...overrides,
  };
}

test('building a bundle keeps the portable settings and drops every secret and device-specific one', () => {
  const bundle = buildProfileBundle(input(), 1_700_000_100_000);
  assert.deepEqual(bundle.settings, PORTABLE);
  const text = JSON.stringify(bundle);
  for (const value of Object.values(SECRETS)) assert.equal(text.includes(value), false, 'a secret value is in the file: ' + value);
  for (const key of Object.keys(SECRETS)) assert.equal(text.includes(key), false, 'a secret key name is in the file: ' + key);
  assert.equal(bundle.format, 'ton-profile');
  assert.equal(bundle.version, 1);
  assert.equal(bundle.created_at, 1_700_000_100_000);
});

test('the allowlist contains no key that looks like a secret, a path, a device id or session state', () => {
  const dangerous = /secret|token|password|passwd|credential|access_key|key_id|r2|spotify|cloud|device|director|path|session|license|hash|schema|layout|started_at|total_ms|backfilled|revision/i;
  const keys = Object.keys(PROFILE_SETTING_KEYS);
  assert.ok(keys.length >= 8, 'the allowlist is suspiciously short');
  for (const key of keys) assert.equal(dangerous.test(key), false, `"${key}" must not be exportable`);
});

test('a bundle survives being written and read, with stars deduplicated and sorted', () => {
  const bundle = buildProfileBundle(input());
  assert.deepEqual(bundle.starred, ['sha256:aaa', 'sha256:bbb']);
  const parsed = parseProfileBundle(JSON.stringify(bundle));
  assert.deepEqual(parsed.bundle, bundle);
  assert.deepEqual(parsed.ignoredSettings, []);
  assert.equal(parsed.bundle.listening.length, 1);
  assert.equal(parsed.bundle.playlists[0].track_hashes.length, 2);
});

test('parsing rejects files that are not a TON profile', () => {
  const good = JSON.parse(JSON.stringify(buildProfileBundle(input())));
  const cases: Array<[string, string]> = [
    ['not json', '{nope'],
    ['an array', '[]'],
    ['another format', JSON.stringify({ ...good, format: 'something-else' })],
    ['a future version', JSON.stringify({ ...good, version: 2 })],
    ['stars that are not a list', JSON.stringify({ ...good, starred: 'sha256:aaa' })],
    ['a star that is not text', JSON.stringify({ ...good, starred: [42] })],
    ['playlists that are not a list', JSON.stringify({ ...good, playlists: {} })],
    ['a playlist without a name', JSON.stringify({ ...good, playlists: [{ ...good.playlists[0], name: '' }] })],
    ['listening that is not a list', JSON.stringify({ ...good, listening: null })],
    ['a damaged listening record', JSON.stringify({ ...good, listening: [{ ...good.listening[0], listened_ms: -5 }] })],
    ['a listening record whose intervals exceed the measured time', JSON.stringify({ ...good, listening: [{ ...good.listening[0], listened_ms: 10 }] })],
  ];
  for (const [label, text] of cases) assert.throws(() => parseProfileBundle(text), undefined, `accepted ${label}`);
});

test('a hand-edited file cannot smuggle a secret or an invalid setting back in', () => {
  const good = JSON.parse(JSON.stringify(buildProfileBundle(input())));
  good.settings = {
    ...good.settings,
    cloud_r2_secret_access_key: 'EVIL',
    spotify_client_secret: 'EVIL',
    download_directory: 'C:/Windows',
    language: 'xx',
    volume_percent: 'loud',
    eq_bands: '[1,2]',
    loudness_normalization: 'maybe',
  };
  const parsed = parseProfileBundle(JSON.stringify(good));
  assert.equal(parsed.bundle.settings.cloud_r2_secret_access_key, undefined);
  assert.equal(parsed.bundle.settings.spotify_client_secret, undefined);
  assert.equal(parsed.bundle.settings.download_directory, undefined);
  assert.equal(parsed.bundle.settings.language, undefined, 'an unknown language must be dropped');
  assert.equal(parsed.bundle.settings.volume_percent, undefined, 'a non-numeric volume must be dropped');
  assert.equal(parsed.bundle.settings.eq_bands, undefined, 'EQ bands that are not ten numbers must be dropped');
  assert.equal(parsed.bundle.settings.loudness_normalization, undefined, 'a non-boolean flag must be dropped');
  assert.deepEqual([...parsed.ignoredSettings].sort(), ['cloud_r2_secret_access_key', 'download_directory', 'eq_bands', 'language', 'loudness_normalization', 'spotify_client_secret', 'volume_percent']);
  assert.equal(parsed.bundle.settings.eq_preset, 'bass', 'valid settings must be kept');
});

test('a track is identified by its content hash first, then its file hash, and otherwise cannot be identified', () => {
  assert.equal(starIdentity({ content_hash_sha256: 'abc', file_hash: 'def' }), 'sha256:abc');
  assert.equal(starIdentity({ content_hash_sha256: null, file_hash: 'def' }), 'file:def');
  assert.equal(starIdentity({ content_hash_sha256: '', file_hash: '' }), null);
  assert.equal(starIdentity({}), null);
});
