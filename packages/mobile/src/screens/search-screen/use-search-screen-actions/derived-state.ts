import { useMemo } from 'react';
import type { SearchResult, SearchSortMode, SearchSource } from '@ton/core';
import { getSourceCounts, getVisibleResults } from '@ton/core';

export function useSearchDerivedState(
  activeSource: SearchSource | 'all',
  query: string,
  results: Record<SearchSource, SearchResult[]>,
  sortMode: SearchSortMode,
) {
  const counts = useMemo(() => getSourceCounts(results), [results]);
  const displayResults = useMemo(
    () => getVisibleResults(results, activeSource, query, sortMode),
    [results, activeSource, query, sortMode],
  );

  return { counts, displayResults };
}
