import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCarPlaybackMediaId } from '../../packages/mobile/src/services/car-media-id';

test('parses an Android Auto Library selection', () => {
  assert.deepEqual(parseCarPlaybackMediaId('ton:play:library:42'), {
    kind: 'library',
    trackId: 42,
  });
});

test('parses a playlist occurrence without collapsing duplicate tracks', () => {
  assert.deepEqual(parseCarPlaybackMediaId('ton:play:playlist:7:301'), {
    kind: 'playlist',
    playlistId: 7,
    playlistTrackId: 301,
  });
});

test('rejects browse nodes and malformed media IDs', () => {
  assert.equal(parseCarPlaybackMediaId('ton:playlist:7'), null);
  assert.equal(parseCarPlaybackMediaId('ton:play:playlist:7'), null);
  assert.equal(parseCarPlaybackMediaId('ton:play:library:-1'), null);
  assert.equal(parseCarPlaybackMediaId('https://example.com'), null);
});
