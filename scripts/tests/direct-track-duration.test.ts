import assert from 'node:assert/strict';
import test from 'node:test';
import type { SearchResult } from '../../packages/core/src/types/search.ts';
import { parseDirectTrackUrl } from '../../packages/core/src/services/detect-track-url.ts';
import {
  mapDirectTrackOEmbedResult,
  normalizeTrackDurationMs,
  resolveDirectTrackWithFallback,
} from '../../packages/core/src/services/direct-track-oembed.ts';
import {
  getYouTubeTrackById,
  getYouTubeTrackFromSearch,
} from '../../packages/mobile/src/services/youtube-search/search.ts';
import { runWithDeadline } from '../../packages/desktop/src-main/handlers/search-handler/orchestration.ts';

const videoId = 'dQw4w9WgXcQ';
const directTrack = parseDirectTrackUrl(`https://youtu.be/${videoId}`)!;
const noOEmbed = async () => { throw new Error('Unexpected oEmbed fallback'); };

function result(duration: number | null, overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: videoId,
    source: 'youtube',
    title: 'Primary title',
    artist: 'Primary artist',
    album: null,
    duration_ms: duration,
    thumbnail_url: null,
    url: directTrack.url,
    is_downloaded: false,
    ...overrides,
  };
}

test('provider seconds are converted once while Spotify milliseconds remain milliseconds', () => {
  assert.equal(normalizeTrackDurationMs(213.456, 'seconds'), 213_456);
  assert.equal(normalizeTrackDurationMs(213_456, 'milliseconds'), 213_456);
  assert.equal(normalizeTrackDurationMs(213.4567, 'seconds'), 213_457);
  assert.equal(normalizeTrackDurationMs(213_456.7, 'milliseconds'), 213_457);
});

test('unavailable, malformed, and unrepresentable durations stay unknown', () => {
  for (const unit of ['seconds', 'milliseconds'] as const) {
    for (const value of [null, undefined, '', '213', 0, -1, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      assert.equal(normalizeTrackDurationMs(value, unit), null, `${unit}: ${String(value)}`);
    }
  }
  assert.equal(normalizeTrackDurationMs(0.0004, 'seconds'), null);
  assert.equal(normalizeTrackDurationMs(0.0005, 'seconds'), 1);
  assert.equal(normalizeTrackDurationMs(0.4, 'milliseconds'), null);
  assert.equal(normalizeTrackDurationMs(0.5, 'milliseconds'), 1);
  assert.equal(normalizeTrackDurationMs(Number.MAX_SAFE_INTEGER, 'milliseconds'), Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeTrackDurationMs(Number.MAX_SAFE_INTEGER + 1, 'milliseconds'), null);
});

test('known primary duration takes precedence over fallback metadata', async () => {
  const resolved = await resolveDirectTrackWithFallback(
    directTrack,
    async () => result(213_000),
    async () => result(999_000, { title: 'Different title' }),
    noOEmbed,
  );
  assert.equal(resolved.duration_ms, 213_000);
  assert.equal(resolved.title, 'Primary title');
});

test('duration fallback enriches missing primary duration without replacing better primary metadata', async () => {
  const primary = Object.freeze(result(NaN));
  const resolved = await resolveDirectTrackWithFallback(
    directTrack,
    async () => primary,
    async () => result(213_456, { title: 'Fallback title', artist: 'Fallback artist' }),
    noOEmbed,
  );
  assert.equal(resolved.duration_ms, 213_456);
  assert.equal(resolved.title, 'Primary title');
  assert.equal(resolved.artist, 'Primary artist');
  assert.ok(Number.isNaN(primary.duration_ms));
});

test('a recommendation cannot supply another track duration, and fallback errors preserve unknown primary metadata', async () => {
  const unrelated = await resolveDirectTrackWithFallback(
    directTrack,
    async () => result(null),
    async () => result(999_000, { id: 'other-video' }),
    noOEmbed,
  );
  assert.equal(unrelated.duration_ms, null);
  assert.equal(unrelated.id, videoId);

  const unavailable = await resolveDirectTrackWithFallback(
    directTrack,
    async () => result(null),
    async () => { throw new Error('Secondary provider unavailable'); },
    noOEmbed,
  );
  assert.equal(unavailable.duration_ms, null);
  assert.equal(unavailable.title, 'Primary title');
});

test('oEmbed fields never manufacture duration when duration-bearing providers are unavailable', async () => {
  const resolved = await resolveDirectTrackWithFallback(
    directTrack,
    async () => { throw new Error('Player endpoint unavailable'); },
    async () => null,
    async () => ({
      title: 'Public fallback title',
      author_name: 'Public fallback artist',
      duration: 213,
      duration_ms: 213_000,
      lengthSeconds: '213',
    }),
  );
  assert.equal(resolved.title, 'Public fallback title');
  assert.equal(resolved.duration_ms, null);
  assert.equal(mapDirectTrackOEmbedResult(directTrack, {
    title: 'Public fallback title', duration: 213, duration_ms: 213_000,
  }).duration_ms, null);
});

test('mobile player metadata converts seconds and does not treat live or missing values as a completed-song duration', async () => {
  for (const [metadata, expected] of [
    [{ duration: 213.456 }, 213_456],
    [{ duration: NaN }, null],
    [{}, null],
    [{ duration: 213, is_live: true }, null],
    [{ duration: 213, is_upcoming: true }, null],
  ] as const) {
    const resolved = await getYouTubeTrackById(videoId, undefined, async () => ({
      getBasicInfo: async () => ({ basic_info: { title: 'Player title', ...metadata } }),
    }) as never);
    assert.equal(resolved.duration_ms, expected);
  }
});

test('mobile blocked-player direct links recover exact-song duration from search, not the first recommendation', async () => {
  const clientFactory = async () => ({
    getBasicInfo: async () => { throw new Error('Player endpoint unavailable'); },
    search: async () => ({
      results: [
        { type: 'Video', id: 'recommendation', duration: { seconds: 999 } },
        { type: 'Video', id: videoId, title: { text: 'Exact song' }, duration: { seconds: 213.456 } },
      ],
    }),
  }) as never;
  const resolved = await resolveDirectTrackWithFallback(
    directTrack,
    () => getYouTubeTrackById(videoId, undefined, clientFactory),
    () => getYouTubeTrackFromSearch(videoId, undefined, clientFactory),
    noOEmbed,
  );
  assert.equal(resolved.id, videoId);
  assert.equal(resolved.title, 'Exact song');
  assert.equal(resolved.duration_ms, 213_456);
});

test('mobile search fallback keeps absent or live duration unknown and rejects unrelated results', async () => {
  for (const video of [
    { id: videoId },
    { id: videoId, duration: { seconds: 0 } },
    { id: videoId, duration: { seconds: Infinity } },
    { id: videoId, is_live: true, duration: { seconds: 213 } },
  ]) {
    const resolved = await getYouTubeTrackFromSearch(videoId, undefined, async () => ({
      search: async () => ({ results: [{ type: 'Video', ...video }] }),
    }) as never);
    assert.equal(resolved?.duration_ms, null);
  }
  assert.equal(await getYouTubeTrackFromSearch(videoId, undefined, async () => ({
    search: async () => ({ results: [{ type: 'Video', id: 'unrelated', duration: { seconds: 213 } }] }),
  }) as never), null);
});

test('cancellation during duration lookup cannot emit a stale direct-link result', async () => {
  const controller = new AbortController();
  await assert.rejects(resolveDirectTrackWithFallback(
    directTrack,
    async () => result(null),
    async () => {
      controller.abort();
      return result(213_000);
    },
    noOEmbed,
    controller.signal,
  ), /aborted/i);
});

test('a hung duration provider is bounded and cannot hide usable primary metadata', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const signals: AbortSignal[] = [];
  const parent = new AbortController();
  const pending = resolveDirectTrackWithFallback(
    directTrack,
    async () => result(null),
    () => runWithDeadline(async (signal) => {
      signals.push(signal);
      return Promise.withResolvers<never>().promise;
    }, parent.signal, 5_000),
    noOEmbed,
    parent.signal,
  );
  await Promise.resolve();
  await Promise.resolve();
  context.mock.timers.runAll();
  const resolved = await pending;
  assert.equal(resolved.title, 'Primary title');
  assert.equal(resolved.duration_ms, null);
  assert.equal(signals[0]?.aborted, true);
});
