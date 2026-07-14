import assert from 'node:assert/strict';
import test from 'node:test';
import type { Track } from '../../packages/core/src/types/track.ts';
import type { CloudLibraryManifestV1, CloudTrackEntry } from '../../packages/core/src/types/cloud-sync.ts';
import { mergeCloudLibraryManifests } from '../../packages/core/src/services/cloud-sync/manifest.ts';
import {
  formatDownloadedDate,
  formatTrackFileSizeSummary,
  summarizeTrackFileSizes,
} from '../../packages/core/src/utils/track-metadata.ts';
import { getFilteredTracks } from '../../packages/core/src/utils/store-helpers/library.ts';

test('formats the TON completion timestamp as a calendar day only', () => {
  const middayUtc = Date.UTC(2026, 6, 14, 12) / 1000;
  assert.equal(formatDownloadedDate(middayUtc, 'en-US'), 'Jul 14, 2026');
  assert.equal(formatDownloadedDate(null, 'en-US'), '—');
  assert.equal(formatDownloadedDate(Number.NaN, 'en-US'), '—');
});

test('counts one physical file per canonical track id', () => {
  const summary = summarizeTrackFileSizes([
    { id: 1, file_size: 1_048_576 },
    { id: 1, file_size: 1_048_576 },
    { id: 2, file_size: 1_048_576 },
  ]);

  assert.deepEqual(summary, {
    knownBytes: 2_097_152,
    uniqueTrackCount: 2,
    unknownCount: 0,
  });
  assert.equal(formatTrackFileSizeSummary(summary), '2.0 MB');
});

test('keeps distinct canonical files separate and reports incomplete totals honestly', () => {
  const partial = summarizeTrackFileSizes([
    { id: 1, file_size: 1_048_576 },
    { id: 2, file_size: 1_048_576 },
    { id: 3, file_size: null },
  ]);
  assert.equal(formatTrackFileSizeSummary(partial), '≥ 2.0 MB');

  const unknown = summarizeTrackFileSizes([{ id: 4, file_size: null }]);
  assert.equal(formatTrackFileSizeSummary(unknown), '—');
  assert.equal(
    formatTrackFileSizeSummary(summarizeTrackFileSizes([])),
    '0 B',
  );
});

test('sorts downloaded dates while always leaving unknown dates last', () => {
  const rows = [
    { id: 1, downloaded_at: null },
    { id: 2, downloaded_at: 200 },
    { id: 3, downloaded_at: 100 },
  ] as Track[];

  assert.deepEqual(
    getFilteredTracks(rows, '', 'downloaded_at', 'asc').map((track) => track.id),
    [3, 2, 1],
  );
  assert.deepEqual(
    getFilteredTracks(rows, '', 'downloaded_at', 'desc').map((track) => track.id),
    [2, 3, 1],
  );
});

function cloudTrack(downloadedAt: number | null, updatedAt: number): CloudTrackEntry {
  return {
    content_hash_sha256: 'hash',
    object_key: 'tracks/hash.m4a',
    file_name: 'track.m4a',
    file_size: 100,
    format: 'm4a',
    artwork_hash_sha256: null,
    artwork_object_key: null,
    artwork_file_name: null,
    youtube_id: null,
    spotify_id: null,
    soundcloud_id: null,
    source_url: null,
    downloaded_at: downloadedAt,
    added_at: 1,
    updated_at: updatedAt,
    metadata: {
      title: 'Track',
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

function cloudManifest(track: CloudTrackEntry, deviceId: string): CloudLibraryManifestV1 {
  return {
    schema_version: 1,
    app: 'TON',
    created_at: 1,
    updated_at: track.updated_at,
    device_id: deviceId,
    revision: `${deviceId}-revision`,
    library_track_hashes: [track.content_hash_sha256],
    tracks: [track],
    playlists: [],
  };
}

test('cloud merge keeps the original earliest download completion', () => {
  const olderManifest = cloudManifest(cloudTrack(100, 1), 'remote');
  const newerManifest = cloudManifest(cloudTrack(200, 2), 'local');
  const merged = mergeCloudLibraryManifests(olderManifest, newerManifest);

  assert.equal(merged.tracks[0].updated_at, 2);
  assert.equal(merged.tracks[0].downloaded_at, 100);
});
