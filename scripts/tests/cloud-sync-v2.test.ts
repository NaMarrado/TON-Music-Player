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
  };
  const discoveredAfterRebase = {
    key: 'objects/rebased', filePath: '/rebased', contentType: 'audio/mpeg', hash: HASH_B,
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

type FakeTask = { id: number; at: number; callback: () => void };

class FakeTimer implements CloudAutoSyncTimerAdapter {
  now = 0;

  private nextId = 1;

  private tasks: FakeTask[] = [];

  setTimeout(callback: () => void, delayMs: number): unknown {
    const task = { id: this.nextId++, at: this.now + delayMs, callback };
    this.tasks.push(task);
    return task.id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks = this.tasks.filter((task) => task.id !== handle);
  }

  async advance(delayMs: number): Promise<void> {
    const target = this.now + delayMs;
    while (true) {
      this.tasks.sort((left, right) => left.at - right.at || left.id - right.id);
      const task = this.tasks[0];
      if (!task || task.at > target) break;
      this.tasks.shift();
      this.now = task.at;
      task.callback();
      await flushPromises();
    }
    this.now = target;
    await flushPromises();
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('coordinator is single-flight and coalesces an in-flight request into one follow-up', async () => {
  const timer = new FakeTimer();
  const resolvers: Array<() => void> = [];
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    run: async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      active -= 1;
      return { pendingChanges: 0 };
    },
  });
  coordinator.start(false);
  const first = coordinator.runNow('manual');
  const second = coordinator.runNow('manual');
  await flushPromises();
  assert.equal(calls, 1);
  resolvers.shift()?.();
  await first;
  await flushPromises();
  assert.equal(calls, 2);
  resolvers.shift()?.();
  await second;
  assert.equal(maximumActive, 1);
});

test('coordinator reserves single-flight before synchronous status callbacks can re-enter', async () => {
  const resolvers: Array<() => void> = [];
  let followUp: Promise<void> | null = null;
  let requestedFollowUp = false;
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    onStatus: (status) => {
      if (status.state === 'syncing' && !requestedFollowUp) {
        requestedFollowUp = true;
        followUp = coordinator.runNow('manual');
      }
    },
    run: async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      active -= 1;
    },
  });
  coordinator.start(false);
  const first = coordinator.runNow('manual');
  assert.equal(calls, 1);
  assert.equal(maximumActive, 1);
  resolvers.shift()?.();
  await first;
  await flushPromises();
  assert.equal(calls, 2);
  assert.equal(maximumActive, 1);
  resolvers.shift()?.();
  await followUp;
  coordinator.stop();
});

test('status observer exceptions cannot strand coordinator waiters or state', async () => {
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    onStatus: () => {
      throw new Error('observer failed');
    },
    run: async () => {
      calls += 1;
      return { pendingChanges: 0 };
    },
  });

  assert.doesNotThrow(() => coordinator.start(false));
  await coordinator.runNow('manual');
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'idle');
  coordinator.stop();
});

test('coordinator hydrates persisted status and resumes a future retry deadline', async () => {
  const timer = new FakeTimer();
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    initialStatus: {
      pendingChanges: 4,
      pendingDownloads: 2,
      lastSuccessAt: 100,
      lastErrorKey: 'cloudStorageErrorNetwork',
      nextRetryAt: 5_000,
    },
    run: async () => {
      calls += 1;
      return { pendingChanges: 0, pendingDownloads: 0 };
    },
  });
  coordinator.start();
  assert.deepEqual(coordinator.getStatus(), {
    enabled: true,
    configured: true,
    state: 'backing-off',
    pendingChanges: 4,
    pendingDownloads: 2,
    lastSuccessAt: 100,
    lastErrorKey: 'cloudStorageErrorNetwork',
    nextRetryAt: 5_000,
  });
  await timer.advance(4_999);
  assert.equal(calls, 0);
  await timer.advance(1);
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().lastErrorKey, null);
  coordinator.stop();
});

test('coordinator restores a persisted permanent-error latch without a startup request', async () => {
  const clock = new FakeTimer();
  let runs = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    timer: clock,
    now: () => clock.now,
    enabled: true,
    configured: true,
    online: true,
    initialPermanentError: true,
    initialStatus: {
      lastErrorKey: 'cloudStorageErrorAccessDenied',
      nextRetryAt: clock.now + 5_000,
    },
    run: async () => {
      runs += 1;
    },
  });

  coordinator.start(true);
  await flushPromises();
  assert.equal(runs, 0);
  assert.equal(coordinator.getStatus().state, 'error');
  assert.equal(coordinator.getStatus().nextRetryAt, null);

  coordinator.setOnline(false);
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(runs, 0);
  assert.equal(coordinator.getStatus().state, 'error');

  coordinator.notifyConfigurationChanged(true);
  await flushPromises();
  assert.equal(runs, 1);
});

test('manual sync remains available while automatic sync is disabled', async () => {
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: false,
    configured: true,
    run: async ({ origin }) => {
      calls += 1;
      assert.equal(origin, 'manual');
      return { pendingChanges: 0 };
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(calls, 0);
  assert.equal(coordinator.getStatus().state, 'disabled');
  await coordinator.runNow('manual');
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'disabled');
  coordinator.stop();
});

test('enabling automatic sync and restoring network trigger an immediate run', async () => {
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: false,
    configured: true,
    online: false,
    run: async () => {
      calls += 1;
    },
  });
  coordinator.start();
  coordinator.setEnabled(true);
  await flushPromises();
  assert.equal(calls, 0);
  assert.equal(coordinator.getStatus().state, 'offline');
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'idle');
  coordinator.stop();
});

test('local changes use a 2 second trailing debounce capped at 10 seconds', async () => {
  const timer = new FakeTimer();
  const callTimes: number[] = [];
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    pollIntervalMs: 100_000,
    retryJitterRatio: 0,
    run: async () => {
      callTimes.push(timer.now);
      return { pendingChanges: 0 };
    },
  });
  coordinator.start(false);
  coordinator.markLocalChange();
  for (let index = 0; index < 6; index += 1) {
    await timer.advance(1_500);
    coordinator.markLocalChange();
  }
  assert.deepEqual(callTimes, []);
  await timer.advance(1_000);
  assert.deepEqual(callTimes, [10_000]);
});

test('poll is chained after completion and never overlaps a slow run', async () => {
  const timer = new FakeTimer();
  const resolvers: Array<() => void> = [];
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    pollIntervalMs: 10_000,
    run: async () => {
      calls += 1;
      await new Promise<void>((resolve) => resolvers.push(resolve));
    },
  });
  coordinator.start(false);
  await timer.advance(10_000);
  assert.equal(calls, 1);
  await timer.advance(20_000);
  assert.equal(calls, 1);
  resolvers.shift()?.();
  await flushPromises();
  await timer.advance(9_999);
  assert.equal(calls, 1);
  await timer.advance(1);
  assert.equal(calls, 2);
  coordinator.stop();
  resolvers.shift()?.();
});

test('transient errors back off while permanent errors pause until manual retry', async () => {
  const timer = new FakeTimer();
  let calls = 0;
  let permanent = false;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    retryDelaysMs: [5_000],
    retryJitterRatio: 0,
    classifyError: () => permanent ? 'permanent' : 'transient',
    run: async () => {
      calls += 1;
      throw new Error(permanent ? 'auth' : 'network');
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(coordinator.getStatus().state, 'backing-off');
  await timer.advance(4_999);
  assert.equal(calls, 1);
  permanent = true;
  await timer.advance(1);
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().state, 'error');
  await timer.advance(100_000);
  assert.equal(calls, 2);
  await assert.rejects(coordinator.runNow('manual'), /auth/);
  assert.equal(calls, 3);
});

test('a queued manual recovery cancels the preceding automatic retry timer', async () => {
  const timer = new FakeTimer();
  let calls = 0;
  let rejectFirst: ((error: Error) => void) | undefined;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    pollIntervalMs: 10_000,
    retryDelaysMs: [5_000],
    retryJitterRatio: 0,
    classifyError: () => 'transient',
    run: async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return { pendingChanges: 0 };
    },
  });

  coordinator.start(false);
  const automatic = coordinator.runNow('auto');
  await flushPromises();
  const manual = coordinator.runNow('manual');
  rejectFirst?.(new Error('network'));

  await assert.rejects(automatic, /network/);
  await manual;
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().nextRetryAt, null);

  await timer.advance(5_000);
  assert.equal(calls, 2);
  coordinator.stop();
});

test('saving corrected configuration clears a permanent error and retries automatically', async () => {
  let calls = 0;
  let credentialsValid = false;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    classifyError: () => 'permanent',
    run: async () => {
      calls += 1;
      if (!credentialsValid) {
        throw new Error('auth');
      }
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'error');

  credentialsValid = true;
  coordinator.setOnline(false);
  coordinator.notifyConfigurationChanged(true);
  await flushPromises();
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'offline');
  assert.equal(coordinator.getStatus().lastErrorKey, null);
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().state, 'idle');
  assert.equal(coordinator.getStatus().lastErrorKey, null);
  coordinator.stop();
});

test('a resume queued before an aborted automatic run settles is not lost', async () => {
  let calls = 0;
  let rejectActive: ((error: Error) => void) | null = null;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    online: true,
    classifyError: (error) => (
      error instanceof Error && error.message === 'aborted' ? 'cancelled' : 'transient'
    ),
    cancelActive: () => rejectActive?.(new Error('aborted')),
    run: async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((_resolve, reject) => {
          rejectActive = reject;
        });
      }
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(calls, 1);

  coordinator.setOnline(false);
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().state, 'idle');
  coordinator.stop();
});

test('cancel delegates to the platform and settles as cancelled without backoff', async () => {
  const timer = new FakeTimer();
  let rejectRun: ((error: Error) => void) | undefined;
  let cancels = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    classifyError: (error) => error instanceof Error && error.message === 'cancelled'
      ? 'cancelled'
      : 'transient',
    cancelActive: () => {
      cancels += 1;
      rejectRun?.(new Error('cancelled'));
    },
    run: () => new Promise((_, reject) => {
      rejectRun = reject;
    }),
  });
  coordinator.start(false);
  const run = coordinator.runNow('manual');
  await flushPromises();
  coordinator.cancelActive();
  await assert.rejects(run, /cancelled/);
  assert.equal(cancels, 1);
  assert.equal(coordinator.getStatus().state, 'idle');
  assert.equal(coordinator.getStatus().nextRetryAt, null);
});
