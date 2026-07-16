import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDirectTrackUrl } from '../../packages/core/src/services/detect-track-url';

test('detects supported YouTube track URL shapes', () => {
  for (const value of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM',
    'https://youtu.be/dQw4w9WgXcQ?t=12',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  ]) {
    assert.deepEqual(parseDirectTrackUrl(value), {
      id: 'dQw4w9WgXcQ',
      source: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  }
});

test('detects Spotify and SoundCloud tracks but not playlists', () => {
  assert.deepEqual(
    parseDirectTrackUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=test'),
    {
      id: '4uLU6hMCjMI75M1A2tKUQC',
      source: 'spotify',
      url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    },
  );
  assert.deepEqual(
    parseDirectTrackUrl('https://soundcloud.com/artist/track-name?utm_source=test'),
    {
      id: 'https://soundcloud.com/artist/track-name',
      source: 'soundcloud',
      url: 'https://soundcloud.com/artist/track-name',
    },
  );
  assert.equal(parseDirectTrackUrl('https://open.spotify.com/playlist/abc'), null);
  assert.equal(parseDirectTrackUrl('https://soundcloud.com/artist/sets/playlist'), null);
});

test('does not classify text or arbitrary URLs as track URLs', () => {
  assert.equal(parseDirectTrackUrl('make me fade'), null);
  assert.equal(parseDirectTrackUrl('https://example.com/watch?v=dQw4w9WgXcQ'), null);
});
