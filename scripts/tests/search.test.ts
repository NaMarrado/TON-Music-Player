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

test('canonical search query is identical for typing, paste whitespace and unicode punctuation', () => {
  const typed = 'Madeon - Pop Culture (live mashup)';
  const pasted = '  Madeon \u2014  Pop Culture \uFF08live\tmashup\uFF09\r\n';
  assert.equal(canonicalizeSearchQuery(pasted), typed);
  assert.equal(canonicalizeSearchQuery(`${typed}   `), typed);
});

test('relaxed retry removes presentation noise but preserves meaningful variants', () => {
  const relaxed = relaxSearchQuery(
    'Madeon - Pop Culture (Official Music Video) 4K live mashup acoustic remix',
  );
  assert.doesNotMatch(relaxed, /official|music video|4k/i);
  assert.match(relaxed, /live mashup acoustic remix/i);
});

test('provider-specific limits are fixed and clamp every caller request', () => {
  assert.deepEqual(SEARCH_PAGE_LIMITS, {
    youtube: 20,
    spotify: 10,
    soundcloud: 10,
    local: 50,
    playlist: 50,
  });
  assert.equal(getSearchPageLimit('spotify', 50), 10);
  assert.equal(getSearchPageLimit('youtube', 500), 20);
  assert.equal(getSearchPageLimit('local', 7), 7);
  assert.equal(getSearchPageLimit('playlist', 0), 1);
});

test('FTS query drops punctuation-only tokens and uses tolerant token OR', () => {
  assert.equal(
    buildSearchFtsQuery('Madeon - Pop Culture !!! extra'),
    '"madeon"* OR "pop"* OR "culture"* OR "extra"*',
  );
  assert.equal(buildSearchFtsQuery('--- ((( )))'), '');
});

test('exact online hit outranks a weaker local candidate and no candidate is filtered', () => {
  const query = 'Madeon - Pop Culture (live mashup)';
  const local = result(
    'local-edit',
    'local',
    'Pop Culture extended fan edit',
    'Madeon tribute',
  );
  const exact = result(
    'lTx3G6h2xyA',
    'youtube',
    'Pop Culture (live mashup)',
    'Madeon',
  );
  const unrelated = result('other', 'spotify', 'Finale', 'Madeon');
  const ranked = rankSearchResults([local, unrelated, exact], `${query} extra-token`);

  assert.equal(ranked.length, 3);
  assert.equal(ranked[0]?.id, exact.id);
  assert.equal(rankSearchResults([local, exact], query)[0]?.id, exact.id);
  assert.ok(searchRelevanceScore(exact, query) > searchRelevanceScore(local, query));
});

test('meaningful live/mashup variants affect order while presentation labels do not', () => {
  const query = 'Madeon Pop Culture live mashup';
  const exact = result('exact', 'youtube', 'Pop Culture (live mashup) [Official Video]', 'Madeon');
  const studio = result('studio', 'youtube', 'Pop Culture', 'Madeon');
  assert.equal(rankSearchResults([studio, exact], query)[0]?.id, 'exact');
  assert.equal(
    searchRelevanceScore(exact, query),
    searchRelevanceScore(
      result('clean', 'youtube', 'Pop Culture (live mashup)', 'Madeon'),
      query,
    ),
  );
});

test('request IDs are monotonic and stale provider events are rejected solely by ID', () => {
  const nextRequestId = createSearchRequestIdGenerator(100);
  const firstEdit = nextRequestId();
  const pasteEdit = nextRequestId();
  const clearEdit = nextRequestId();
  assert.deepEqual([firstEdit, pasteEdit, clearEdit], [101, 102, 103]);
  assert.equal(isCurrentSearchRequest(clearEdit, firstEdit), false);
  assert.equal(isCurrentSearchRequest(clearEdit, clearEdit), true);
});

test('mobile pagination trusts explicit provider hasMore instead of result count', () => {
  const current = createEmptySearchMoreState();
  const explicit = createEmptySearchMoreState();
  explicit.spotify = true;
  const merged = mergeSearchMoreState(current, explicit, ['spotify', 'youtube']);
  assert.equal(merged.spotify, true);
  assert.equal(merged.youtube, false);
});

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

test('mobile YouTube reuses its continuation session across pages', async () => {
  resetYouTubeSearchSessions();
  let initialSearchCalls = 0;
  let continuationCalls = 0;

  type MockPage = {
    results: Array<{
      type: string;
      id: string;
      title: { text: string };
      author: { name: string };
      duration: { seconds: number };
      thumbnails: Array<{ url: string }>;
    }>;
    has_continuation: boolean;
    getContinuation: () => Promise<MockPage>;
  };

  const pages: MockPage[] = [];
  for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
    const start = pageIndex * 20;
    pages.push({
      results: Array.from({ length: 20 }, (_, itemIndex) => {
        const id = String(start + itemIndex);
        return {
          type: 'Video',
          id,
          title: { text: `Track ${id}` },
          author: { name: 'Artist' },
          duration: { seconds: 180 },
          thumbnails: [{ url: `https://example.invalid/${id}.jpg` }],
        };
      }),
      has_continuation: pageIndex < 4,
      getContinuation: async () => {
        continuationCalls++;
        return pages[pageIndex + 1] as MockPage;
      },
    });
  }

  const clientFactory = async () => ({
    search: async () => {
      initialSearchCalls++;
      return pages[0] as MockPage;
    },
  }) as never;

  const first = await searchMobileYouTubePage('session paging test', 20, 0, undefined, clientFactory);
  const second = await searchMobileYouTubePage('session paging test', 20, 20, undefined, clientFactory);
  const third = await searchMobileYouTubePage('session paging test', 20, 40, undefined, clientFactory);
  const fourth = await searchMobileYouTubePage('session paging test', 20, 60, undefined, clientFactory);

  assert.equal(initialSearchCalls, 1);
  assert.deepEqual(
    [first.results[0]?.id, second.results[0]?.id, third.results[0]?.id, fourth.results[0]?.id],
    ['0', '20', '40', '60'],
  );
  assert.deepEqual(
    [first.results.length, second.results.length, third.results.length, fourth.results.length],
    [20, 20, 20, 20],
  );
  assert.ok(continuationCalls <= 3 * 4);
});

test('mobile YouTube continuation abort rejects promptly', async () => {
  resetYouTubeSearchSessions();
  const controller = new AbortController();
  const initialPage = {
    results: Array.from({ length: 20 }, (_, index) => ({
      type: 'Video',
      id: String(index),
      title: { text: `Track ${index}` },
      author: { name: 'Artist' },
      duration: { seconds: 180 },
      thumbnails: [],
    })),
    has_continuation: true,
    getContinuation: () => new Promise(() => {}),
  };
  const pending = searchMobileYouTubePage(
    'abort paging test',
    20,
    0,
    controller.signal,
    async () => ({ search: async () => initialPage }) as never,
  );
  controller.abort();
  await assert.rejects(pending, /aborted/i);
});
