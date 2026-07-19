import { getSourceCounts, getVisibleResults, type SearchResult } from '@ton/core';
import { useSearchStore } from './search-store-state';

export function getDisplayResults(): SearchResult[] {
  const { results, activeSource, effectiveQuery, sortMode } = useSearchStore.getState();
  return getVisibleResults(results, activeSource, effectiveQuery, sortMode);
}

export function getTabCounts(): Record<string, number> {
  return getSourceCounts(useSearchStore.getState().results);
}
