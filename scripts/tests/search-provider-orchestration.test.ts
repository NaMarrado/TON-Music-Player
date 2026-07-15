import assert from 'node:assert/strict';
import test from 'node:test';
import type { SearchResult, SearchSource } from '../../packages/core/src/types/search.ts';
import {
  SEARCH_PAGE_LIMITS,
  buildSearchFtsQuery,
  canonicalizeSearchQuery,
  createSearchRequestIdGenerator,
  getSearchPageLimit,
  isCurrentSearchRequest,
  rankSearchResults,
  relaxSearchQuery,
  searchRelevanceScore,
} from '../../packages/core/src/utils/search.ts';
import { executeSpotifySearchPage } from '../../packages/core/src/services/spotify-search.ts';
import {
  resetSearchProviderQueryAliases,
  searchWithRelaxedRetry,
  settleSearchProviderTasks,
} from '../../packages/desktop/src-main/handlers/search-handler/orchestration.ts';
import {
  createEmptySearchMoreState,
  mergeSearchMoreState,
} from '../../packages/mobile/src/services/search-plan.ts';
import {
  resetYouTubeSearchSessions,
  searchYouTubePage as searchMobileYouTubePage,
} from '../../packages/mobile/src/services/youtube-search/search.ts';

function result(
  id: string,
  source: SearchSource,
  title: string,
  artist: string,
  album: string | null = null,
): SearchResult {
  return {
    id,
    source,
    title,
    artist,
    album,
    duration_ms: null,
    thumbnail_url: null,
    url: `https://example.invalid/${id}`,
    is_downloaded: source === 'local' || source === 'playlist',
  };
}


test('provider orchestration streams a fast source before a slow source settles', async () => {
  let resolveSlow: ((value: { results: SearchResult[]; hasMore: boolean }) => void) | undefined;
  const slowPage = new Promise<{ results: SearchResult[]; hasMore: boolean }>((resolve) => {
    resolveSlow = resolve;
  });
  const events: Array<{ source: SearchSource; status: string }> = [];
  const controller = new AbortController();
  const settled = settleSearchProviderTasks(
    17,
    [
      {
        source: 'youtube',
        offset: 0,
        deadlineMs: 100,
        run: async () => ({
          results: [result('fast', 'youtube', 'Pop Culture (live mashup)', 'Madeon')],
          hasMore: true,
        }),
      },
      {
        source: 'soundcloud',
        offset: 0,
        deadlineMs: 100,
        run: async () => slowPage,
      },
    ],
    controller.signal,
    (event) => events.push({ source: event.source, status: event.status }),
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [{ source: 'youtube', status: 'success' }]);
  resolveSlow?.({ results: [], hasMore: false });
  await settled;
  assert.deepEqual(events, [
    { source: 'youtube', status: 'success' },
    { source: 'soundcloud', status: 'success' },
  ]);
});
test('a nonresponsive provider times out without hiding another provider result', async () => {
  const events: Array<{ source: SearchSource; status: string; error?: string }> = [];
  const errors = await settleSearchProviderTasks(
    18,
    [
      {
        source: 'youtube',
        offset: 0,
        deadlineMs: 25,
        run: async () => ({
          results: [result('visible', 'youtube', 'Pop Culture', 'Madeon')],
          hasMore: false,
        }),
      },
      {
        source: 'soundcloud',
        offset: 0,
        deadlineMs: 25,
        run: () => new Promise(() => {}),
      },
    ],
    new AbortController().signal,
    (event) => events.push({ source: event.source, status: event.status, error: event.error }),
  );

  assert.equal(events[0]?.source, 'youtube');
  assert.equal(events[0]?.status, 'success');
  assert.equal(events[1]?.source, 'soundcloud');
  assert.equal(events[1]?.status, 'error');
  assert.match(errors.soundcloud ?? '', /timed out/i);
});

test('abort settles a nonresponsive provider as cancelled without a user-facing error', async () => {
  const controller = new AbortController();
  const events: Array<{ status: string; error?: string }> = [];
  const settled = settleSearchProviderTasks(
    19,
    [{
      source: 'soundcloud',
      offset: 0,
      deadlineMs: 1_000,
      run: () => new Promise(() => {}),
    }],
    controller.signal,
    (event) => events.push({ status: event.status, error: event.error }),
  );
  controller.abort();
  const errors = await settled;
  assert.deepEqual(events, [{ status: 'cancelled', error: undefined }]);
  assert.deepEqual(errors, {});
});

test('provider abort wording is still an error when our signal was not cancelled', async () => {
  const statuses: string[] = [];
  const errors = await settleSearchProviderTasks(
    20,
    [{
      source: 'youtube',
      offset: 0,
      run: async () => {
        throw new Error('Upstream server aborted the request');
      },
    }],
    new AbortController().signal,
    (event) => statuses.push(event.status),
  );
  assert.deepEqual(statuses, ['error']);
  assert.match(errors.youtube ?? '', /aborted/i);
});

test('zero-result provider performs exactly one relaxed retry', async () => {
  resetSearchProviderQueryAliases();
  const calls: string[] = [];
  const page = await searchWithRelaxedRetry(
    'youtube',
    'Madeon Pop Culture (Official Music Video) live mashup 4K',
    0,
    new AbortController().signal,
    async (query) => {
      calls.push(query);
      return calls.length === 1
        ? { results: [], hasMore: false }
        : {
            results: [result('hit', 'youtube', 'Pop Culture (live mashup)', 'Madeon')],
            hasMore: false,
          };
    },
  );
  assert.equal(calls.length, 2);
  assert.match(calls[0] ?? '', /official/i);
  assert.doesNotMatch(calls[1] ?? '', /official|4k/i);
  assert.equal(page.results[0]?.id, 'hit');
});

test('relaxed provider query is reused for the next pagination offset', async () => {
  resetSearchProviderQueryAliases();
  const original = 'Madeon Pop Culture (Official Music Video) live mashup 4K';
  const calls: Array<{ query: string; offset: number }> = [];
  const search = (offset: number) => searchWithRelaxedRetry(
    'youtube',
    original,
    offset,
    new AbortController().signal,
    async (query) => {
      calls.push({ query, offset });
      if (offset === 0 && calls.length === 1) return { results: [], hasMore: false };
      return {
        results: [result(`page-${offset}`, 'youtube', 'Pop Culture (live mashup)', 'Madeon')],
        hasMore: offset === 0,
      };
    },
  );

  await search(0);
  await search(20);
  assert.equal(calls.length, 3);
  assert.match(calls[0]?.query ?? '', /official/i);
  assert.doesNotMatch(calls[1]?.query ?? '', /official|4k/i);
  assert.equal(calls[2]?.query, calls[1]?.query);
  assert.equal(calls[2]?.offset, 20);
});

test('Spotify mocked pagination is capped at ten and advances by ten', async () => {
  const requests: Array<{ limit: number; offset: number }> = [];
  const mockSpotifyProvider = async (_query: string, limit: number, offset: number) => {
    requests.push({ limit, offset });
    return {
      tracks: {
        items: Array.from({ length: 10 }, (_, index) => ({
          id: String(offset + index),
          name: `Track ${offset + index}`,
          artists: [{ name: 'Artist' }],
          album: { name: 'Album', images: [] },
          duration_ms: 180_000,
          external_urls: { spotify: `https://open.spotify.com/track/${offset + index}` },
        })),
        total: 20,
      },
    };
  };
  const first = await executeSpotifySearchPage(mockSpotifyProvider, 'query', 50, 0);
  const second = await executeSpotifySearchPage(mockSpotifyProvider, 'query', 50, 10);
  assert.deepEqual(requests, [
    { limit: 10, offset: 0 },
    { limit: 10, offset: 10 },
  ]);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
});
