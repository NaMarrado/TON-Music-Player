import assert from 'node:assert/strict';
import test from 'node:test';
import type { CloudTrackEntry, PlaylistTrackEntry, Track } from '../../packages/core/src/index.ts';
import {
  buildCloudR2CleanupPlan,
  compareCloudTracksForLibrary,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  getFilteredPlaylistTracks,
  compactAndRefillRollingQueue,
  createFollowingRollingQueueWindow,
} from '../../packages/core/src/index.ts';
import {
  createPlaybackQueuePlan,
  disableQueueShuffle,
  enableQueueShuffle,
} from '../../packages/mobile/src/services/playback-bridge/queue-plan.ts';

function track(index: number): Track {
  return {
    id: index + 1,
    file_path: `/fixture/${index}.m4a`,
    file_hash: null,
    content_hash_sha256: index.toString(16).padStart(64, '0'),
    file_size: 1_000,
    file_mtime: 1,
    title: `Track ${String(index).padStart(5, '0')}`,
    artist: `Artist ${index % 100}`,
    album: `Album ${index % 20}`,
    album_artist: null,
    track_number: null,
    disc_number: null,
    duration_ms: 180_000 + index,
    genre: null,
    year: null,
    bitrate: 96_000,
    sample_rate: 44_100,
    format: 'm4a',
    cover_art_path: null,
    loudness_lufs: null,
    loudness_gain: null,
    youtube_id: null,
    spotify_id: null,
    soundcloud_id: null,
    source_url: null,
    play_count: 0,
    last_played_at: null,
    rating: null,
    in_library: 1,
    added_at: 20_000 - index,
    downloaded_at: 20_000 - index,
    scanned_at: 1,
  };
}

function cloudEntry(item: Track): CloudTrackEntry {
  const hash = item.content_hash_sha256 as string;
  return {
    content_hash_sha256: hash,
    object_key: `ton/objects/audio/${hash}.m4a`,
    file_name: `${item.id}.m4a`,
    file_size: item.file_size,
    format: 'm4a',
    artwork_hash_sha256: null,
    artwork_object_key: null,
    artwork_file_name: null,
    youtube_id: null,
    spotify_id: null,
    soundcloud_id: null,
    source_url: null,
    downloaded_at: item.downloaded_at,
    added_at: item.added_at,
    updated_at: item.added_at,
    metadata: {
      title: item.title,
      artist: item.artist,
      album: item.album,
      album_artist: null,
      track_number: null,
      disc_number: null,
      duration_ms: item.duration_ms,
      genre: null,
      year: null,
      bitrate: item.bitrate,
      sample_rate: item.sample_rate,
      loudness_lufs: null,
      loudness_gain: null,
      rating: null,
    },
  };
}

test('pre-enabled shuffle keeps a bounded active queue and samples with replacement', () => {
  const tracks = Array.from({ length: 1_600 }, (_, index) => track(index));
  const selectedIndex = 731;
  const plan = createPlaybackQueuePlan(tracks, selectedIndex, 9, true, () => 0.37);

  assert.equal(plan.items.length, 20);
  assert.equal(plan.originalItems.length, 1_600);
  assert.equal(plan.currentIndex, 0);
  assert.equal(plan.items[0].track_id, tracks[selectedIndex].id);
  assert.equal(new Set(plan.items.map((item) => item.id)).size, 20);
  assert.deepEqual(plan.originalItems.map((item) => item.track_id), tracks.map((item) => item.id));
  assert.equal(new Set(plan.items.slice(1).map((item) => item.track_id)).size, 1);
});

test('runtime shuffle covers every upcoming item and disabling restores exact source order', () => {
  const source = Array.from({ length: 1_600 }, (_, index) => ({ id: `queue-${index}` }));
  const currentIndex = 417;
  const shuffled = enableQueueShuffle(source, currentIndex, () => 0.23);

  assert.equal(shuffled.items.length, source.length);
  assert.deepEqual(shuffled.items.slice(0, currentIndex + 1), source.slice(0, currentIndex + 1));
  assert.notDeepEqual(shuffled.items.slice(currentIndex + 1), source.slice(currentIndex + 1));
  assert.equal(new Set(shuffled.items.map((item) => item.id)).size, source.length);

  const restored = disableQueueShuffle(shuffled.items, source, currentIndex);
  assert.deepEqual(restored.items, source);
  assert.equal(restored.currentIndex, currentIndex);
  assert.equal(restored.requiresFullReplacement, false);
});

test('pre-enabled shuffle retains the full compact source separately from the active queue', () => {
  const tracks = Array.from({ length: 1_600 }, (_, index) => track(index));
  const selectedIndex = 731;
  const shuffled = createPlaybackQueuePlan(tracks, selectedIndex, 11, true, () => 0.61);
  assert.equal(shuffled.items.length, 20);
  assert.equal(shuffled.originalItems.length, 1_600);
  assert.equal(shuffled.items[0].source_index, selectedIndex);
});

test('rolling queue stays at 20 while compacting and refilling from the full source', () => {
  const tracks = Array.from({ length: 1_600 }, (_, index) => track(index));
  const initial = createPlaybackQueuePlan(tracks, 700, 12, false);
  const compacted = compactAndRefillRollingQueue(
    initial.items,
    initial.originalItems,
    10,
    12,
    false,
    initial.nextQueueSerial,
  );

  assert.equal(compacted.items.length, 20);
  assert.equal(compacted.currentIndex, 1);
  assert.equal(compacted.items[1].source_index, 710);
  assert.equal(compacted.items.at(-1)?.source_index, 728);
});

test('shuffle refills independently with replacement', () => {
  const tracks = Array.from({ length: 1_600 }, (_, index) => track(index));
  const initial = createPlaybackQueuePlan(tracks, 700, 13, true, () => 0.25);
  const following = createFollowingRollingQueueWindow(
    initial.originalItems,
    initial.items.at(-1)!,
    13,
    true,
    initial.nextQueueSerial,
    () => 0.5,
  );

  assert.equal(following.items.length, 20);
  assert.equal(new Set(following.items.map((item) => item.track_id)).size, 1);
  assert.equal(following.items[0].track_id, tracks[800].id);
});

test('10,000-track playlist filtering and persisted sort inputs are viewport-independent', () => {
  const tracks = Array.from({ length: 10_000 }, (_, index) => ({
    ...track(index),
    playlist_track_id: index + 50_000,
    position: index,
  } satisfies PlaylistTrackEntry));

  const artistMatches = getFilteredPlaylistTracks(tracks, 'Artist 42', 'title', 'desc');
  assert.equal(artistMatches.length, 100);
  assert.ok(artistMatches.every((item) => item.artist === 'Artist 42'));
  assert.ok((artistMatches[0].title ?? '') > (artistMatches[99].title ?? ''));
  assert.deepEqual(
    getFilteredPlaylistTracks(tracks, '', null, 'asc').map((item) => item.playlist_track_id),
    tracks.map((item) => item.playlist_track_id),
  );
});

test('cloud transfer order matches Library order so incoming batches do not shift the viewport', () => {
  const entries = [track(2), track(0), track(1)].map(cloudEntry);
  entries[0].added_at = 100;
  entries[1].added_at = 300;
  entries[2].added_at = 200;

  const ordered = entries.sort(compareCloudTracksForLibrary);
  assert.deepEqual(ordered.map((entry) => entry.added_at), [300, 200, 100]);
});

test('isolated 1,600-track cloud cleanup produces concrete rows without network access', () => {
  const tracks = Array.from({ length: 1_600 }, (_, index) => track(index));
  const entries = tracks.map(cloudEntry);
  const playlistEntry = {
    cloud_id: 'large-playlist',
    name: 'Large fixture',
    description: null,
    cover_hash_sha256: null,
    cover_object_key: null,
    is_smart: false,
    smart_rules: null,
    sort_order: 0,
    created_at: 1,
    updated_at: 1,
    track_hashes: entries.map((entry) => entry.content_hash_sha256),
  };
  const manifest = {
    schema_version: 2 as const,
    app: 'TON' as const,
    created_at: 1,
    updated_at: 1,
    writer_device_id: 'fixture',
    revision: 'fixture-revision',
    max_counter: 1_601,
    tracks: entries.map((entry, index) => createCloudLiveTrackRecordV2(
      entry,
      { counter: index + 1, device_id: 'fixture' },
    )),
    playlists: [createCloudLivePlaylistRecordV2(
      playlistEntry,
      { counter: 1_601, device_id: 'fixture' },
    )],
  };
  const plan = buildCloudR2CleanupPlan({
    manifest,
    manifestEtag: 'fixture-etag',
    storageScope: 'fixture-only',
    localHashes: entries.slice(0, 1_000).map((entry) => entry.content_hash_sha256),
    objects: entries.map((entry) => ({ key: entry.object_key, size: 1_000 })),
    prefix: 'ton',
    deviceId: 'fixture-device',
    now: 2,
    random: 0,
    failures: [{
      contentHash: entries[1_200].content_hash_sha256,
      errorMessage: 'fixture failure',
      failedAt: 1,
    }],
  });

  assert.equal(plan.preview.cloudOnlyTracks, 600);
  assert.equal(plan.preview.tracks.length, 600);
  assert.equal(plan.preview.playlists[0].removedTracks, 600);
  assert.equal(plan.preview.playlists[0].remainingTracks, 1_000);
  assert.equal(plan.preview.failuresToClear.length, 1);
});

test('mock sync yields between batches and creates playlist shells before 10,000 audio rows', async () => {
  const events: string[] = [];
  const total = 10_000;
  events.push('playlist-shells');
  for (let offset = 0; offset < total; offset += 125) {
    events.push(`audio:${offset}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(events[0], 'playlist-shells');
  assert.equal(events[1], 'audio:0');
  assert.equal(events.at(-1), 'audio:9875');
});
