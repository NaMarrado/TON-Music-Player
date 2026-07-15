import { create } from 'zustand';
import { createSearchRequestIdGenerator, type SearchResult, type SearchSource } from '@ton/core';
import { createEmptySearchMoreState, createEmptySearchResults } from '../services/search-plan';

export type ActiveTab = SearchSource | 'all';

export interface SearchState {
  query: string;
  effectiveQuery: string;
  results: Record<SearchSource, SearchResult[]>;
  sourceErrors: Record<string, string>;
  isSearching: boolean;
  activeSource: ActiveTab;
  activeRequestId: number;
  completedSources: SearchSource[];
  pendingSources: SearchSource[];
  loadingMoreSources: SearchSource[];
  hasMoreBySource: Record<SearchSource, boolean>;
}

export const useSearchStore = create<SearchState>()(() => ({
  query: '',
  effectiveQuery: '',
  results: createEmptySearchResults(),
  sourceErrors: {},
  isSearching: false,
  activeSource: 'all',
  activeRequestId: 0,
  completedSources: [],
  pendingSources: [],
  loadingMoreSources: [],
  hasMoreBySource: createEmptySearchMoreState(),
}));

export const searchRuntime = {
  debounceTimer: null as ReturnType<typeof setTimeout> | null,
  activeController: null as AbortController | null,
  nextRequestId: createSearchRequestIdGenerator(),
};
