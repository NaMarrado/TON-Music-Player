import type { SearchResult, SearchSource } from '@ton/core';
import type { ActiveTab } from './search-store-types';
import { DEFAULT_SOURCES } from './search-store-state';

export function getRequestedSources(source: ActiveTab): SearchSource[] {
  return source === 'all' ? DEFAULT_SOURCES : [source];
}

function getSearchResultKey(result: SearchResult): string {
  return `${result.source}:${result.id}`;
}

export function mergeResults(
  currentResults: SearchResult[],
  nextResults: SearchResult[],
  offset: number,
): SearchResult[] {
  if (offset <= 0) {
    return nextResults;
  }

  const merged = currentResults.slice(0, offset);
  const seen = new Set(merged.map(getSearchResultKey));
  for (const result of nextResults) {
    const key = getSearchResultKey(result);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(result);
  }
  return merged;
}
