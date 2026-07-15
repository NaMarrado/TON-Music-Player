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

test('automatic cloud sync is enabled in shared defaults', () => {
  assert.equal(SETTING_DEFAULTS.cloud_auto_sync_enabled, true);
  assert.equal(PERSISTED_SETTING_DEFAULTS.cloud_auto_sync_enabled, true);
});

test('normalizes React Native weak R2 ETags for strong CAS writes', () => {
  assert.equal(normalizeCloudObjectEtag('W/"abc123"'), '"abc123"');
  assert.equal(normalizeCloudObjectEtag(' w/  "abc123" '), '"abc123"');
  assert.equal(normalizeCloudObjectEtag('"abc123"'), '"abc123"');
  assert.equal(normalizeCloudObjectEtag(null), null);
});

test('object upload batches pick up requirements added by a CAS rebase', async () => {
  const completed = new Set<string>();
  const uploaded: string[] = [];
  const existing = new Set(['objects/existing']);
  const adapter = {
    headObject: async (key: string) => existing.has(key),
    uploadObject: async (target: { key: string }) => {
      uploaded.push(target.key);
      return 'uploaded' as const;
    },
  };
  const first = {
    key: 'objects/initial', filePath: '/initial', contentType: 'audio/mpeg', hash: HASH_A,
    progressGroup: HASH_A,
  };
  const discoveredAfterRebase = {
    key: 'objects/rebased', filePath: '/rebased', contentType: 'audio/mpeg', hash: HASH_B,
    progressGroup: HASH_B,
  };
  const repair = {
    key: 'objects/existing', filePath: '/existing', contentType: 'image/jpeg', hash: HASH_A,
  };

  const initialResult = await uploadPendingCloudObjects(
    [first, repair], completed, new Set([repair.key]), adapter,
  );
  const rebasedResult = await uploadPendingCloudObjects(
    [first, repair, discoveredAfterRebase], completed, new Set([repair.key]), adapter,
  );

  assert.deepEqual(initialResult, { uploaded: 1, skipped: 1 });
  assert.deepEqual(rebasedResult, { uploaded: 1, skipped: 0 });
  assert.deepEqual(uploaded, ['objects/initial', 'objects/rebased']);
  assert.deepEqual(
    [...completed].sort(),
    ['objects/existing', 'objects/initial', 'objects/rebased'],
  );
});

test('audio and artwork count as one uploaded track while playlist covers stay auxiliary', async () => {
  const progress: Array<[number, number]> = [];
  await uploadPendingCloudObjects(
    [
      { key: 'audio/a', filePath: '/a', contentType: 'audio/mp4', hash: HASH_A, progressGroup: HASH_A },
      { key: 'art/a', filePath: '/a.jpg', contentType: 'image/jpeg', hash: HASH_B, progressGroup: HASH_A },
      { key: 'audio/b', filePath: '/b', contentType: 'audio/mp4', hash: HASH_B, progressGroup: HASH_B },
      { key: 'playlist/cover', filePath: '/cover.jpg', contentType: 'image/jpeg', hash: HASH_A },
    ],
    new Set(),
    new Set(),
    {
      headObject: async () => false,
      uploadObject: async () => 'uploaded',
    },
    (current, total) => progress.push([current, total]),
  );
  assert.deepEqual(progress, [[0, 2], [1, 2], [2, 2], [2, 2]]);
});

test('V1 bootstrap merges by updated_at, keeps earliest download and lets local win ties', () => {
  const remoteTrack = {
    ...track(HASH_A, 'Remote', 500),
    updated_at: 200,
  };
  const olderLocalTrack = {
    ...track(HASH_A, 'Older local', 100),
    updated_at: 100,
  };
  const tiedLocalTrack = {
    ...track(HASH_A, 'Tied local', 300),
    updated_at: 200,
  };
  assert.equal(
    mergeV1BootstrapTrackEntry(remoteTrack, olderLocalTrack).metadata.title,
    'Remote',
  );
  assert.equal(
    mergeV1BootstrapTrackEntry(remoteTrack, olderLocalTrack).downloaded_at,
    100,
  );
  assert.equal(
    mergeV1BootstrapTrackEntry(remoteTrack, tiedLocalTrack).metadata.title,
    'Tied local',
  );

  const remotePlaylist = playlist('playlist-v1', [HASH_A]);
  remotePlaylist.name = 'Remote playlist';
  remotePlaylist.updated_at = 300;
  const localPlaylist = playlist('playlist-v1', [HASH_A, HASH_B]);
  localPlaylist.name = 'Local playlist';
  localPlaylist.updated_at = 300;
  assert.deepEqual(
    mergeV1BootstrapPlaylistEntry(remotePlaylist, localPlaylist).track_hashes,
    [HASH_A, HASH_B],
  );
});

test('missing V2 manifest bootstraps only without any local or remote V2 history', () => {
  assert.equal(hasCloudV2History({
    revision: null, etag: null, mirroredEntityCount: 0, activationMarkerPresent: false,
  }), false);
  assert.equal(hasCloudV2History({
    revision: 'old-v2', etag: null, mirroredEntityCount: 0, activationMarkerPresent: false,
  }), true);
  assert.equal(hasCloudV2History({
    revision: null, etag: null, mirroredEntityCount: 0, activationMarkerPresent: true,
  }), true);
});

test('mobile upgrade persists an initially unconfirmed V2 activation marker state', async () => {
  const statements: string[] = [];
  const oldSchema = {
    getAllAsync: async () => [{ name: 'scope_id' }, { name: 'revision' }],
    execAsync: async (sql: string) => {
      statements.push(sql);
    },
  } as unknown as Parameters<typeof migrate010>[0];

  await migrate010(oldSchema);
  assert.equal(statements.length, 1);
  assert.match(statements[0] ?? '', /activation_marker_confirmed INTEGER NOT NULL DEFAULT 0/);

  const currentSchema = {
    getAllAsync: async () => [{ name: 'activation_marker_confirmed' }],
    execAsync: async (sql: string) => {
      statements.push(sql);
    },
  } as unknown as Parameters<typeof migrate010>[0];

  await migrate010(currentSchema);
  assert.equal(statements.length, 1);
});

test('forced recovery never uses a conditional manifest GET', () => {
  assert.equal(conditionalManifestEtag(true, false, 0, 'etag-old'), null);
  assert.equal(conditionalManifestEtag(false, false, 0, 'etag-old'), 'etag-old');
  assert.equal(conditionalManifestEtag(false, true, 0, 'etag-old'), null);
  assert.equal(conditionalManifestEtag(false, false, 1, 'etag-old'), null);
});

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
