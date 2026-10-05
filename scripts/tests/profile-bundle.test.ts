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
import type { CloudStorageConfig } from '../../packages/core/src/types/cloud-sync.ts';

/** Belong to this device only: folders, the device's own ids, running state. They never travel. */
const DEVICE_BOUND = {
  cloud_r2_device_id: 'desktop-0000-1111',
  cloud_r2_last_revision: 'REVISION-MARKER-55',
  download_directory: 'C:/Users/me/Music',
  library_directories: '["C:/Users/me/Music"]',
  playback_session: '{"queue":["SESSION-MARKER"]}',
  listening_profile_device: '{"device_id":"DEVICE-MARKER"}',
  listening_profile_active_session: 'ACTIVE-SESSION-MARKER-9f3',
  schema_version: 'SCHEMA-MARKER-77',
  storage_layout_version: 'LAYOUT-MARKER-3',
};
/** Everything else travels, keys included. */
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
  spotify_client_id: 'spotify-client-id-123',
  spotify_client_secret: 'spotify-client-secret-456',
  cloud_auto_sync_enabled: 'true',
  sync_audio_over_cellular: 'false',
  concurrent_downloads: '3',
};
const CLOUD: CloudStorageConfig = {
  accountId: 'acct', bucket: 'my-private-bucket', prefix: 'ton', accessKeyId: 'AKID-123', secretAccessKey: 'R2-SECRET-XYZ', jurisdiction: 'eu',
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
    settings: { ...PORTABLE, ...DEVICE_BOUND },
    cloud: CLOUD,
    starred: ['sha256:bbb', 'sha256:aaa', 'sha256:aaa'],
    listening: [record()],
    ...overrides,
  };
}

test('a profile carries every setting and key, the R2 config with its secret, and nothing that belongs to the device', () => {
  const bundle = buildProfileBundle(input(), 1_700_000_100_000);
  assert.deepEqual(bundle.settings, PORTABLE);
  assert.deepEqual(bundle.cloud, CLOUD);
  const text = JSON.stringify(bundle);
  for (const value of Object.values(DEVICE_BOUND)) assert.equal(text.includes(value), false, 'a device-bound value is in the file: ' + value);
  assert.equal(bundle.format, 'ton-profile');
  assert.equal(bundle.version, 2);
  assert.equal(bundle.created_at, 1_700_000_100_000);
});

test('the setting list contains no folder, device id or running state', () => {
  const deviceBound = /director|path|device_id|session|schema|layout|started_at|total_ms|backfilled|revision/i;
  const keys = Object.keys(PROFILE_SETTING_KEYS);
  assert.ok(keys.includes('spotify_client_secret'), 'the Spotify key must travel');
  for (const key of keys) assert.equal(deviceBound.test(key), false, `"${key}" belongs to the device`);
});

test('a bundle survives being written and read, keys and all, with stars deduplicated and sorted', () => {
  const bundle = buildProfileBundle(input());
  assert.deepEqual(bundle.starred, ['sha256:aaa', 'sha256:bbb']);
  const parsed = parseProfileBundle(JSON.parse(JSON.stringify(bundle)));
  assert.deepEqual(parsed.bundle, bundle);
  assert.deepEqual(parsed.ignoredSettings, []);
  assert.equal(parsed.bundle.cloud?.secretAccessKey, 'R2-SECRET-XYZ');
  assert.equal(parsed.bundle.listening.length, 1);
  const noCloud = buildProfileBundle(input({ cloud: null }));
  assert.equal(parseProfileBundle(JSON.parse(JSON.stringify(noCloud))).bundle.cloud, null);
});

test('parsing rejects anything that is not a TON profile', () => {
  const good = JSON.parse(JSON.stringify(buildProfileBundle(input())));
  const cases: Array<[string, unknown]> = [
    ['not an object', []],
    ['another format', { ...good, format: 'something-else' }],
    ['an older or newer version', { ...good, version: 1 }],
    ['stars that are not a list', { ...good, starred: 'sha256:aaa' }],
    ['a star that is not text', { ...good, starred: [42] }],
    ['listening that is not a list', { ...good, listening: null }],
    ['a damaged listening record', { ...good, listening: [{ ...good.listening[0], listened_ms: -5 }] }],
    ['a cloud config without a bucket', { ...good, cloud: { ...good.cloud, bucket: 7 } }],
    ['a cloud config with an unknown jurisdiction', { ...good, cloud: { ...good.cloud, jurisdiction: 'mars' } }],
  ];
  for (const [label, value] of cases) assert.throws(() => parseProfileBundle(value), undefined, `accepted ${label}`);
});

test('a hand-edited file cannot write folders, device ids or nonsense values', () => {
  const good = JSON.parse(JSON.stringify(buildProfileBundle(input())));
  good.settings = { ...good.settings, download_directory: 'C:/Windows', cloud_r2_device_id: 'stolen', language: 'xx', volume_percent: 'loud', eq_bands: '[1,2]' };
  const parsed = parseProfileBundle(good);
  for (const key of ['download_directory', 'cloud_r2_device_id', 'language', 'volume_percent', 'eq_bands']) assert.equal(parsed.bundle.settings[key], undefined, key);
  assert.deepEqual([...parsed.ignoredSettings].sort(), ['cloud_r2_device_id', 'download_directory', 'eq_bands', 'language', 'volume_percent']);
  assert.equal(parsed.bundle.settings.spotify_client_secret, 'spotify-client-secret-456', 'valid keys must be kept');
});

test('a track is identified by its content hash first, then its file hash, and otherwise cannot be identified', () => {
  assert.equal(starIdentity({ content_hash_sha256: 'abc', file_hash: 'def' }), 'sha256:abc');
  assert.equal(starIdentity({ content_hash_sha256: null, file_hash: 'def' }), 'file:def');
  assert.equal(starIdentity({ content_hash_sha256: '', file_hash: '' }), null);
  assert.equal(starIdentity({}), null);
});
