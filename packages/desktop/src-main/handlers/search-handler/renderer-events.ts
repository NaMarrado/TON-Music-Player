import type { SearchResult } from '@ton/core';

export type SearchSourceResultsEvent = {
  source: SearchResult['source'];
  results: SearchResult[];
  query: string;
  requestId?: number;
  offset: number;
  hasMore: boolean;
};

export function sendSearchSourceResults(
  target: Electron.WebContents,
  source: SearchResult['source'],
  results: SearchResult[],
  query: string,
  requestId?: number,
  offset = 0,
  hasMore = false,
): void {
  if (target.isDestroyed()) {
    return;
  }

  const payload: SearchSourceResultsEvent = {
    source,
    results,
    query,
    requestId,
    offset,
    hasMore,
  };

  target.send('search:source-results', payload);
}
