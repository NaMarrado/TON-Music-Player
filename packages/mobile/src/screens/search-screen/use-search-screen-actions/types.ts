import type { SearchResult, SearchSource } from '@ton/core';
import type { TFunction } from 'i18next';

export type UseSearchScreenActionsArgs = {
  activeSource: SearchSource | 'all';
  query: string;
  results: Record<SearchSource, SearchResult[]>;
  sourceErrors: Record<string, string | null>;
  t: TFunction<'search'>;
};
