import { create } from 'zustand';
import type { SearchResult, SearchSource } from '@ton/core';
import type { SearchState } from './search-store-types';

export const DEFAULT_SOURCES: SearchSource[] = ['youtube', 'spotify', 'soundcloud', 'local', 'playlist'];

export const EMPTY_RESULTS = (): Record<SearchSource, SearchResult[]> => ({
  youtube: [],
  spotify: [],
  soundcloud: [],
  local: [],
  playlist: [],
});

export const EMPTY_LOADED_SOURCES = (): Record<SearchSource, boolean> => ({
  youtube: false,
  spotify: false,
  soundcloud: false,
  local: false,
  playlist: false,
});

export const EMPTY_HAS_MORE = (): Record<SearchSource, boolean> => ({
  youtube: false,
  spotify: false,
  soundcloud: false,
  local: false,
  playlist: false,
});

export const useSearchStore = create<SearchState>()(() => ({
  query: '',
  effectiveQuery: '',
  results: EMPTY_RESULTS(),
  sourceErrors: {},
  isSearching: false,
  activeSource: 'all',
  loadedSources: EMPTY_LOADED_SOURCES(),
  hasMoreBySource: EMPTY_HAS_MORE(),
  activeRequestId: 0,
  pendingSources: [],
  sortMode: 'relevance',
}));
