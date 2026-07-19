import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CloudLibraryManifestV2,
  CloudPlaylistEntry,
  CloudTrackEntry,
} from '../../packages/core/src/index.ts';
import {
  buildCloudR2CleanupPlan,
  buildCloudLocalDeletionPreview,
  executeCloudR2CleanupPlan,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  partitionCloudManifestForLocalExclusions,
} from '../../packages/core/src/index.ts';
import { parseListBucketResult } from '../../packages/mobile/src/services/cloud-sync/r2-list-parser.ts';

const hashes = Array.from({ length: 110 }, (_, index) => index.toString(16).padStart(64, '0'));

function track(hash: string, artworkHash: string | null = null): CloudTrackEntry {
  return {
    content_hash_sha256: hash,
    object_key: `ton/objects/audio/${hash}.m4a`,
    file_name: `${hash}.m4a`,
    file_size: 1_000,
    format: 'm4a',
    artwork_hash_sha256: artworkHash,
    artwork_object_key: artworkHash ? `ton/objects/artwork/${artworkHash}.jpg` : null,
    artwork_file_name: artworkHash ? `${artworkHash}.jpg` : null,
    youtube_id: null,
    spotify_id: null,
    soundcloud_id: null,
    source_url: null,
    added_at: 1,
    updated_at: 1,
    metadata: {
      title: hash,
      artist: null,
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

function playlist(trackHashes: string[]): CloudPlaylistEntry {
  return {
    cloud_id: 'playlist-1',
    name: 'Keep me',
    description: 'Description',
    cover_hash_sha256: hashes[109],
    cover_object_key: `ton/playlists/Keep me/artwork/cover [${hashes[109].slice(0, 8)}].jpg`,
    is_smart: false,
    smart_rules: null,
    sort_order: 0,
    created_at: 1,
    updated_at: 1,
    track_hashes: trackHashes,
  };
}

function manifest(entries: CloudTrackEntry[], playlistEntries: CloudPlaylistEntry[]): CloudLibraryManifestV2 {
  return {
    schema_version: 2,
    app: 'TON',
    created_at: 1,
    updated_at: 1,
    writer_device_id: 'remote',
    revision: 'remote-revision',
    max_counter: entries.length + playlistEntries.length,
    tracks: entries.map((entry, index) => createCloudLiveTrackRecordV2(
      entry,
      { counter: index + 1, device_id: 'remote' },
    )),
    playlists: playlistEntries.map((entry, index) => createCloudLivePlaylistRecordV2(
      entry,
      { counter: entries.length + index + 1, device_id: 'remote' },
    )),
  };
}

test('57 local and 110 cloud tracks produce 53 cloud-only tracks', () => {
  const entries = hashes.map((hash) => track(hash));
  const plan = buildCloudR2CleanupPlan({
    manifest: manifest(entries, [playlist([hashes[0], hashes[57], hashes[57], hashes[1]])]),
    manifestEtag: 'etag-1',
    storageScope: 'account\nbucket\ndefault\nton',
    localHashes: hashes.slice(0, 57),
    objects: entries.map((entry) => ({ key: entry.object_key, size: 1_000 })),
    prefix: 'ton',
    deviceId: 'desktop',
    now: 100,
    random: 0,
    failures: [
      { contentHash: hashes[57], errorMessage: 'missing object', failedAt: 10 },
      { contentHash: hashes[0], errorMessage: 'repaired locally', failedAt: 11 },
    ],
  });

  assert.equal(plan.preview.localTracks, 57);
  assert.equal(plan.preview.cloudTracks, 110);
  assert.equal(plan.preview.cloudOnlyTracks, 53);
  assert.equal(plan.preview.affectedPlaylists, 1);
  assert.equal(plan.preview.objectsToDelete, 53);
  assert.equal(plan.preview.reclaimableBytes, 53_000);
  assert.equal(plan.preview.tracks.length, 53);
  assert.deepEqual(plan.preview.tracks[0], {
    contentHash: hashes[57],
    title: hashes[57],
    artist: null,
    objectKey: entries[57].object_key,
    size: 1_000,
  });
  assert.deepEqual(plan.preview.playlists, [{
    cloudId: 'playlist-1',
    name: 'Keep me',
    removedTracks: 2,
    remainingTracks: 2,
  }]);
  assert.deepEqual(
    plan.preview.failuresToClear.map((failure) => failure.contentHash),
    [hashes[57], hashes[0]],
  );
  const updated = plan.manifest.playlists[0];
  assert.ok(updated && !updated.deleted);
  assert.deepEqual(updated.entry.track_hashes, [hashes[0], hashes[1]]);
});

test('device-local exclusions filter apply without changing cloud playlist membership', () => {
  const remote = manifest(
    [track(hashes[0]), track(hashes[1]), track(hashes[2])],
    [playlist([hashes[0], hashes[1], hashes[1], hashes[2]])],
  );
  const exclusions = new Set([hashes[1], hashes[99]]);
  const filtered = partitionCloudManifestForLocalExclusions(remote, exclusions, false);

  assert.deepEqual(
    filtered.manifest.tracks.map((record) => record.content_hash_sha256),
    [hashes[0], hashes[2]],
  );
  assert.deepEqual(filtered.manifest.playlists, remote.playlists);
  assert.deepEqual([...filtered.matchingHashes], [hashes[1]]);
  assert.equal(filtered.liveHashes.has(hashes[99]), false);
  assert.deepEqual(buildCloudLocalDeletionPreview(remote.tracks, exclusions), {
    deletedTracks: 1,
    reclaimableBytes: 1_000,
  });

  const restored = partitionCloudManifestForLocalExclusions(remote, exclusions, true);
  assert.equal(restored.manifest, remote);
  assert.deepEqual([...restored.matchingHashes], [hashes[1]]);
});

test('shared artwork and playlist cover remain while orphan and unknown objects are handled safely', () => {
  const sharedArtwork = hashes[109];
  const entries = [track(hashes[0], sharedArtwork), track(hashes[1], sharedArtwork)];
  const playlistEntry = playlist([hashes[0], hashes[0], hashes[1]]);
  const sharedArtworkKey = entries[0].artwork_object_key as string;
  const plan = buildCloudR2CleanupPlan({
    manifest: manifest(entries, [playlistEntry]),
    manifestEtag: 'etag-2',
    storageScope: 'account\nbucket\ndefault\nton',
    localHashes: [hashes[0]],
    objects: [
      { key: entries[0].object_key, size: 10 },
      { key: entries[1].object_key, size: 20 },
      { key: sharedArtworkKey, size: 30 },
      { key: playlistEntry.cover_object_key as string, size: 40 },
      { key: 'ton/objects/audio/orphan.m4a', size: 50 },
      { key: 'ton/system/v2/manifest.json', size: 60 },
      { key: 'other/private.bin', size: 70 },
    ],
    prefix: 'ton',
    deviceId: 'mobile',
    now: 200,
    random: 0,
  });

  assert.deepEqual(plan.objectKeysToDelete, [
    entries[1].object_key,
    'ton/objects/audio/orphan.m4a',
  ].sort());
  assert.equal(plan.preview.reclaimableBytes, 70);
  const updated = plan.manifest.playlists[0];
  assert.ok(updated && !updated.deleted);
  assert.deepEqual(updated.entry.track_hashes, [hashes[0], hashes[0]]);
  assert.equal(updated.entry.cover_object_key, playlistEntry.cover_object_key);
});

test('preview token changes with manifest etag or local library fingerprint', () => {
  const remote = manifest([track(hashes[0]), track(hashes[1])], []);
  const build = (
    etag: string,
    localHashes: string[],
    storageScope = 'account\nbucket\ndefault\nton',
    objectSize = 10,
  ) => buildCloudR2CleanupPlan({
    manifest: remote,
    manifestEtag: etag,
    storageScope,
    localHashes,
    objects: [{ key: remote.tracks[1].deleted ? '' : remote.tracks[1].entry.object_key, size: objectSize }],
    prefix: 'ton',
    deviceId: 'test',
    now: 300,
    random: 0,
  }).preview.previewToken;
  assert.notEqual(build('etag-1', [hashes[0]]), build('etag-2', [hashes[0]]));
  assert.notEqual(build('etag-1', [hashes[0]]), build('etag-1', [hashes[1]]));
  assert.notEqual(
    build('etag-1', [hashes[0]]),
    build('etag-1', [hashes[0]], 'account\nother-bucket\ndefault\nton'),
  );
  assert.notEqual(build('etag-1', [hashes[0]]), build('etag-1', [hashes[0]], undefined, 11));
});

test('R2 listing parser keeps exact object sizes and pagination token', () => {
  const parsed = parseListBucketResult(`<?xml version="1.0"?>
    <ListBucketResult>
      <Contents><Key>ton/objects/audio/a&amp;b.m4a</Key><Size>1234</Size></Contents>
      <Contents><Key>ton/objects/artwork/c.jpg</Key><Size>56</Size></Contents>
      <NextContinuationToken>next&amp;page</NextContinuationToken>
    </ListBucketResult>`);
  assert.deepEqual(parsed.objects, [
    { key: 'ton/objects/audio/a&b.m4a', size: 1_234 },
    { key: 'ton/objects/artwork/c.jpg', size: 56 },
  ]);
  assert.equal(parsed.nextContinuationToken, 'next&page');
});

test('cleanup execution stops on stale CAS without touching local state or objects', async () => {
  const entries = [track(hashes[0]), track(hashes[1])];
  const plan = buildCloudR2CleanupPlan({
    manifest: manifest(entries, []),
    manifestEtag: 'stale-etag',
    storageScope: 'fixture',
    localHashes: [hashes[0]],
    objects: entries.map((entry) => ({ key: entry.object_key, size: 1_000 })),
    prefix: 'ton',
    deviceId: 'fixture',
  });
  let committed = false;
  let deleted = false;
  const result = await executeCloudR2CleanupPlan(plan, {
    publishManifest: async () => ({ status: 'stale' }),
    commitLocalState: async () => { committed = true; },
    deleteObject: async () => { deleted = true; },
  });

  assert.equal(result.status, 'stale');
  assert.equal(committed, false);
  assert.equal(deleted, false);
});

test('cleanup cancellation before CAS has no side effects', async () => {
  const entry = track(hashes[0]);
  const plan = buildCloudR2CleanupPlan({
    manifest: manifest([entry], []),
    manifestEtag: 'etag',
    storageScope: 'fixture',
    localHashes: [],
    objects: [{ key: entry.object_key, size: 1_000 }],
    prefix: 'ton',
    deviceId: 'fixture',
  });
  const controller = new AbortController();
  controller.abort();
  let published = false;

  await assert.rejects(() => executeCloudR2CleanupPlan(plan, {
    publishManifest: async () => {
      published = true;
      return { status: 'ok', etag: 'new-etag' };
    },
    commitLocalState: async () => undefined,
    deleteObject: async () => undefined,
  }, { signal: controller.signal }), /cloud_sync_cancelled/);
  assert.equal(published, false);
});

test('cleanup cancellation after CAS commits metadata and leaves objects for the next cleanup', async () => {
  const entry = track(hashes[0]);
  const plan = buildCloudR2CleanupPlan({
    manifest: manifest([entry], []),
    manifestEtag: 'etag',
    storageScope: 'fixture',
    localHashes: [],
    objects: [{ key: entry.object_key, size: 1_000 }],
    prefix: 'ton',
    deviceId: 'fixture',
  });
  const controller = new AbortController();
  let committed = false;
  let deleted = false;

  await assert.rejects(() => executeCloudR2CleanupPlan(plan, {
    publishManifest: async () => {
      controller.abort();
      return { status: 'ok', etag: 'new-etag' };
    },
    commitLocalState: async () => { committed = true; },
    deleteObject: async () => { deleted = true; },
  }, { signal: controller.signal }), /cloud_sync_cancelled/);
  assert.equal(committed, true);
  assert.equal(deleted, false);
});

test('cleanup execution reports partial object delete failures and keeps progressing', async () => {
  const entries = [track(hashes[0]), track(hashes[1])];
  const plan = buildCloudR2CleanupPlan({
    manifest: manifest(entries, []),
    manifestEtag: 'etag',
    storageScope: 'fixture',
    localHashes: [],
    objects: entries.map((entry, index) => ({ key: entry.object_key, size: (index + 1) * 1_000 })),
    prefix: 'ton',
    deviceId: 'fixture',
  });
  const progress: number[] = [];
  const result = await executeCloudR2CleanupPlan(plan, {
    publishManifest: async () => ({ status: 'ok', etag: 'new-etag' }),
    commitLocalState: async () => undefined,
    deleteObject: async (key) => {
      if (key === entries[1].object_key) throw new Error('fixture-delete-failure');
    },
  }, { onProgress: (value) => progress.push(value.current) });

  assert.equal(result.status, 'completed');
  assert.equal(result.deletedObjects, 1);
  assert.equal(result.failedObjects, 1);
  assert.equal(result.freedBytes, 1_000);
  assert.deepEqual(progress, [1, 2]);
});
