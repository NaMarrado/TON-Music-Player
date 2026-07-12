import { useMemo } from 'react';
import type { SearchResult, SearchSource } from '@ton/core';
import { getSourceCounts, getVisibleResults } from '@ton/core';

export function useSearchDerivedState(
  activeSource: SearchSource | 'all',
  query: string,
  results: Record<SearchSource, SearchResult[]>,
) {
  const counts = useMemo(() => getSourceCounts(results), [results]);
  const displayResults = useMemo(
    () => getVisibleResults(results, activeSource, query),
    [results, activeSource, query],
  );

  return { counts, displayResults };
}
