import type { SearchResult, SearchSortMode, SearchSource } from '@ton/core';
import type { TFunction } from 'i18next';

export type UseSearchScreenActionsArgs = {
  activeSource: SearchSource | 'all';
  query: string;
  results: Record<SearchSource, SearchResult[]>;
  sourceErrors: Record<string, string | null>;
  sortMode: SearchSortMode;
  t: TFunction<'search'>;
};
