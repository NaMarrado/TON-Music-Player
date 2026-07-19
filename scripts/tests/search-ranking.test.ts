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
  parseYouTubeViewCount,
  relaxSearchQuery,
  searchRelevanceScore,
  sortSearchResults,
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

test('YouTube view counts are parsed without additional metadata requests', () => {
  assert.equal(parseYouTubeViewCount('1,234,567 views'), 1_234_567);
  assert.equal(parseYouTubeViewCount('1.2M views'), 1_200_000);
  assert.equal(parseYouTubeViewCount('987K views'), 987_000);
  assert.equal(parseYouTubeViewCount(null), null);
});

test('most viewed sorting is stable and keeps unknown counts last', () => {
  const firstUnknown = result('unknown-1', 'youtube', 'Unknown 1', 'Artist');
  const lower = { ...result('lower', 'youtube', 'Lower', 'Artist'), view_count: 10 };
  const higher = { ...result('higher', 'youtube', 'Higher', 'Artist'), view_count: 20 };
  const secondUnknown = result('unknown-2', 'youtube', 'Unknown 2', 'Artist');
  const tied = { ...result('tied', 'youtube', 'Tied', 'Artist'), view_count: 20 };

  assert.deepEqual(
    sortSearchResults(
      [firstUnknown, lower, higher, secondUnknown, tied],
      'most_viewed',
    ).map((item) => item.id),
    ['higher', 'tied', 'lower', 'unknown-1', 'unknown-2'],
  );
  assert.deepEqual(
    sortSearchResults([lower, higher], 'relevance').map((item) => item.id),
    ['lower', 'higher'],
  );
});
