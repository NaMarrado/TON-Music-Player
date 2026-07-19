import type { SearchResult, SearchSortMode, SearchSource } from '../../types';
import { rankSearchResults, searchRelevanceScore, sortSearchResults } from '../search';

/** @deprecated Prefer searchRelevanceScore. Kept for store compatibility. */
export function relevanceScore(result: SearchResult, query: string): number {
  return searchRelevanceScore(result, query);
}

export function getVisibleResults(
  results: Record<SearchSource, SearchResult[]>,
  activeSource: SearchSource | 'all',
  query: string,
  sortMode: SearchSortMode = 'relevance',
): SearchResult[] {
  const visible = activeSource === 'all'
    ? [
        ...results.local,
        ...results.playlist,
        ...results.youtube,
        ...results.spotify,
        ...results.soundcloud,
      ]
    : [...(results[activeSource] || [])];

  const ranked = query.trim() ? rankSearchResults(visible, query) : visible;
  return activeSource === 'youtube' ? sortSearchResults(ranked, sortMode) : ranked;
}

export function getSourceCounts(
  results: Record<SearchSource, SearchResult[]>,
): Record<string, number> {
  return {
    all: Object.values(results).reduce((sum, arr) => sum + arr.length, 0),
    youtube: results.youtube.length,
    spotify: results.spotify.length,
    soundcloud: results.soundcloud.length,
    local: results.local.length,
    playlist: results.playlist.length,
  };
}
