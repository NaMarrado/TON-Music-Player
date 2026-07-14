import type { SearchResult, SearchSource } from '@ton/core';

export type ActiveTab = SearchSource | 'all';

export interface SearchState {
  query: string;
  effectiveQuery: string;
  results: Record<SearchSource, SearchResult[]>;
  sourceErrors: Record<string, string>;
  isSearching: boolean;
  activeSource: ActiveTab;
  loadedSources: Record<SearchSource, boolean>;
  hasMoreBySource: Record<SearchSource, boolean>;
  activeRequestId: number;
  pendingSources: SearchSource[];
}
