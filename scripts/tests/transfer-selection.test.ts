import assert from 'node:assert/strict';
import test from 'node:test';
import { narrowManifestToPlaylists } from '../../packages/core/src/library-transfer/selection.ts';
import type { ExportManifest, ExportTrackEntry } from '../../packages/core/src/types/export.ts';

const track = (hash: string): ExportTrackEntry => ({
  file_hash: hash, relative_path: `tracks/${hash}.m4a`,
  metadata: { title: hash, artist: null, album: null, genre: null, year: null, duration_ms: 1000, loudness_lufs: null, loudness_gain: null },
});

const manifest: ExportManifest = {
  version: 1, bundle_type: 'playlist', created_at: 1, device_name: 'pc', track_count: 4, playlist_count: 3, total_size_bytes: 4000,
  library_track_hashes: [],
  tracks: [track('a'), track('b'), track('c'), track('d')],
  playlists: [
    { name: 'Road', description: null, is_smart: false, smart_rules: null, track_hashes: ['a', 'b'] },
    { name: 'Gym', description: null, is_smart: false, smart_rules: null, track_hashes: ['b', 'c'], cover_relative_path: 'covers/gym.jpg' },
    { name: 'Sleep', description: null, is_smart: false, smart_rules: null, track_hashes: ['d'] },
  ],
};

test('only the chosen playlists stay, with exactly the songs they use, in their order', () => {
  const narrowed = narrowManifestToPlaylists(manifest, [1]);
  assert.deepEqual(narrowed.playlists.map((playlist) => playlist.name), ['Gym']);
  assert.deepEqual(narrowed.tracks.map((entry) => entry.file_hash), ['b', 'c']);
  assert.equal(narrowed.track_count, 2);
  assert.equal(narrowed.playlist_count, 1);
  assert.equal(narrowed.playlists[0].cover_relative_path, 'covers/gym.jpg');
  const two = narrowManifestToPlaylists(manifest, [2, 0]);
  assert.deepEqual(two.playlists.map((playlist) => playlist.name), ['Road', 'Sleep']);
  assert.deepEqual(two.tracks.map((entry) => entry.file_hash), ['a', 'b', 'd']);
});

test('choosing nothing keeps nothing; unknown indexes are ignored; the input is not changed', () => {
  const none = narrowManifestToPlaylists(manifest, []);
  assert.equal(none.playlists.length, 0);
  assert.equal(none.tracks.length, 0);
  assert.equal(narrowManifestToPlaylists(manifest, [9, -1]).playlists.length, 0);
  assert.equal(manifest.playlists.length, 3);
  assert.equal(manifest.tracks.length, 4);
});
