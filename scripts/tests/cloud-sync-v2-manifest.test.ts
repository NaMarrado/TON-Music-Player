import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CloudAutoSyncTimerAdapter,
  CloudLibraryManifestV2,
  CloudPlaylistEntry,
  CloudTrackEntry,
} from '../../packages/core/src/index.ts';
import {
  CloudAutoSyncCoordinator,
  PERSISTED_SETTING_DEFAULTS,
  SETTING_DEFAULTS,
  buildCloudContentArtworkObjectKey,
  buildCloudContentAudioObjectKey,
  buildCloudV2CommitObjectKey,
  buildCloudV2ActivationObjectKey,
  buildCloudV2ManifestObjectKey,
  compareCloudEntityVersions,
  createCloudDeletedTrackRecordV2,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  mergeCloudLibraryManifestsV2,
  nextCloudEntityVersion,
  normalizeCloudObjectEtag,
  parseCloudLibraryManifestV2,
  signR2Request,
} from '../../packages/core/src/index.ts';
import { uploadPendingCloudObjects } from '../../packages/desktop/src-main/services/cloud-sync/pending-object-uploader.ts';
import {
  mergeV1BootstrapPlaylistEntry,
  mergeV1BootstrapTrackEntry,
} from '../../packages/desktop/src-main/services/cloud-sync/v1-bootstrap-merge.ts';
import {
  conditionalManifestEtag,
  hasCloudV2History,
} from '../../packages/desktop/src-main/services/cloud-sync/v2-bootstrap-guard.ts';
import { migrate010 } from '../../packages/mobile/src/services/migrations/010-cloud-v2-activation.ts';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
function track(hash: string, title: string, downloadedAt: number | null): CloudTrackEntry {
  return {
    content_hash_sha256: hash,
    object_key: `objects/${hash}`,
    file_name: `${title}.mp3`,
    file_size: 123,
    format: 'mp3',
    artwork_hash_sha256: null,
    artwork_object_key: null,
    artwork_file_name: null,
    youtube_id: null,
    spotify_id: null,
    soundcloud_id: null,
    source_url: null,
    downloaded_at: downloadedAt,
    added_at: 10,
    updated_at: 10,
    metadata: {
      title,
      artist: 'Artist',
      album: null,
      album_artist: null,
      track_number: null,
      disc_number: null,
      duration_ms: null,
      genre: null,
      year: null,
      bitrate: null,
      sample_rate: null,
      loudness_lufs: null,
      loudness_gain: null,
      rating: null,
    },
  };
}

function playlist(id: string, hashes: string[]): CloudPlaylistEntry {
  return {
    cloud_id: id,
    name: id,
    description: null,
    cover_hash_sha256: null,
    cover_object_key: null,
    is_smart: false,
    smart_rules: null,
    sort_order: 0,
    created_at: 10,
    updated_at: 10,
    track_hashes: hashes,
  };
}

function manifest(
  writer: string,
  tracks: CloudLibraryManifestV2['tracks'] = [],
  playlists: CloudLibraryManifestV2['playlists'] = [],
): CloudLibraryManifestV2 {
  return {
    schema_version: 2,
    app: 'TON',
    created_at: 1,
    updated_at: 10,
    writer_device_id: writer,
    revision: `${writer}-revision`,
    max_counter: Math.max(
      0,
      ...tracks.map((record) => record.version.counter),
      ...playlists.map((record) => record.version.counter),
    ),
    tracks,
    playlists,
  };
}

test('V2 parser rejects malformed tombstones and inconsistent blob records before apply', () => {
  const valid = manifest(
    'desktop',
    [createCloudLiveTrackRecordV2(
      track(HASH_A, 'Valid', 5),
      { counter: 1, device_id: 'desktop' },
    )],
    [createCloudLivePlaylistRecordV2(
      playlist('playlist-valid', [HASH_A]),
      { counter: 2, device_id: 'desktop' },
    )],
  );
  assert.deepEqual(parseCloudLibraryManifestV2(valid), valid);

  const stringTombstone = structuredClone(valid) as unknown as {
    tracks: Array<{ deleted: unknown }>;
  };
  stringTombstone.tracks[0].deleted = 'false';
  assert.equal(parseCloudLibraryManifestV2(stringTombstone), null);

  const inconsistentArtwork = structuredClone(valid);
  const liveTrack = inconsistentArtwork.tracks[0];
  if (!liveTrack || liveTrack.deleted) throw new Error('test fixture must be live');
  liveTrack.entry.artwork_hash_sha256 = HASH_B;
  liveTrack.entry.artwork_object_key = null;
  assert.equal(parseCloudLibraryManifestV2(inconsistentArtwork), null);

  const staleMaximum = structuredClone(valid);
  staleMaximum.max_counter = 0;
  assert.equal(parseCloudLibraryManifestV2(staleMaximum), null);
});
test('V2 keys use an isolated manifest and immutable content-addressed blobs', () => {
  assert.equal(buildCloudV2ManifestObjectKey('/music/'), 'music/system/v2/manifest.json');
  assert.equal(buildCloudV2ActivationObjectKey('/music/'), 'music/system/v2/.activated');
  assert.equal(buildCloudV2CommitObjectKey('music', 'r1'), 'music/system/v2/commits/r1.json');
  assert.equal(
    buildCloudContentAudioObjectKey('music', HASH_A.toUpperCase(), '.MP3'),
    `music/objects/audio/${HASH_A}.mp3`,
  );
  assert.equal(
    buildCloudContentArtworkObjectKey('music', HASH_B, 'JPG'),
    `music/objects/artwork/${HASH_B}.jpg`,
  );
  assert.throws(() => buildCloudContentAudioObjectKey('music', 'bad', 'mp3'), /SHA-256/);
});

test('Lamport versions compare deterministically and advance past observed state', () => {
  assert.equal(
    compareCloudEntityVersions({ counter: 2, device_id: 'a' }, { counter: 1, device_id: 'z' }),
    1,
  );
  assert.equal(
    compareCloudEntityVersions({ counter: 2, device_id: 'a' }, { counter: 2, device_id: 'z' }),
    -1,
  );
  assert.deepEqual(nextCloudEntityVersion(7, 'phone'), { counter: 8, device_id: 'phone' });
});

test('conditional ETag headers are included in the SigV4 signed header set', () => {
  const putRequest = signR2Request({
    config: {
      accountId: 'account',
      bucket: 'bucket',
      prefix: 'music',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      jurisdiction: 'default',
    },
    method: 'PUT',
    key: 'music/system/v2/manifest.json',
    headers: { 'If-Match': '"etag-1"', 'content-type': 'application/json' },
    body: '{}',
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(putRequest.headers['If-Match'], '"etag-1"');
  assert.match(putRequest.headers.Authorization, /SignedHeaders=[^,]*if-match/);

  const getRequest = signR2Request({
    config: {
      accountId: 'account',
      bucket: 'bucket',
      prefix: 'music',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      jurisdiction: 'default',
    },
    method: 'GET',
    key: 'music/system/v2/manifest.json',
    headers: { 'If-None-Match': '"etag-1"' },
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(getRequest.headers['If-None-Match'], '"etag-1"');
  assert.match(getRequest.headers.Authorization, /SignedHeaders=[^,]*if-none-match/);
});

test('V2 merge preserves unrelated changes, earliest downloaded_at and tombstones', () => {
  const oldA = createCloudLiveTrackRecordV2(
    track(HASH_A, 'Old A', 200),
    { counter: 1, device_id: 'desktop' },
  );
  const newA = createCloudLiveTrackRecordV2(
    track(HASH_A, 'New A', 300),
    { counter: 3, device_id: 'phone' },
  );
  const addedB = createCloudLiveTrackRecordV2(
    track(HASH_B, 'B', 400),
    { counter: 2, device_id: 'desktop' },
  );
  const remotePlaylist = createCloudLivePlaylistRecordV2(
    playlist('playlist-1', [HASH_A]),
    { counter: 2, device_id: 'phone' },
  );

  const merged = mergeCloudLibraryManifestsV2(
    manifest('desktop', [oldA, addedB]),
    manifest('phone', [newA], [remotePlaylist]),
    { writerDeviceId: 'publisher', revision: 'published', updatedAt: 20 },
  );
  assert.equal(merged.tracks.length, 2);
  const mergedA = merged.tracks.find((record) => record.content_hash_sha256 === HASH_A);
  assert.equal(mergedA?.deleted, false);
  if (!mergedA?.deleted) {
    assert.equal(mergedA.entry.metadata.title, 'New A');
    assert.equal(mergedA.entry.downloaded_at, 200);
  }
  assert.equal(merged.playlists.length, 1);

  const deleted = createCloudDeletedTrackRecordV2(
    HASH_A,
    { counter: 4, device_id: 'desktop' },
    30,
  );
  const withDeletion = mergeCloudLibraryManifestsV2(merged, manifest('desktop', [deleted]));
  assert.equal(withDeletion.tracks.find((record) => record.content_hash_sha256 === HASH_A)?.deleted, true);

  const restored = createCloudLiveTrackRecordV2(
    track(HASH_A, 'Restored', 200),
    { counter: 5, device_id: 'phone' },
  );
  const withRestore = mergeCloudLibraryManifestsV2(withDeletion, manifest('phone', [restored]));
  assert.equal(withRestore.tracks.find((record) => record.content_hash_sha256 === HASH_A)?.deleted, false);
});

test('V2 merge normalizes hashes, resolves duplicate records and repairs max_counter', () => {
  const older = createCloudLiveTrackRecordV2(
    track(HASH_A, 'Older', 300),
    { counter: 3, device_id: 'desktop' },
  );
  const newer = createCloudDeletedTrackRecordV2(
    HASH_A.toUpperCase(),
    { counter: 7, device_id: 'phone' },
    40,
  );
  const local = manifest('desktop', [older, newer]);
  local.max_counter = 1;

  const merged = mergeCloudLibraryManifestsV2(null, local);
  assert.equal(merged.tracks.length, 1);
  assert.equal(merged.tracks[0]?.content_hash_sha256, HASH_A);
  assert.equal(merged.tracks[0]?.deleted, true);
  assert.equal(merged.max_counter, 7);
});
