import type { SearchQuery, SearchSource } from '@ton/core';
import { SEARCH_DEBOUNCE_MS, SEARCH_RESULTS_LIMIT } from '@ton/core';
import { countPerfEvent, markPerf } from '../utils/perf';
import type { ActiveTab, SearchSourceResultsEvent } from './search-store-types';
import {
  EMPTY_HAS_MORE,
  EMPTY_LOADED_SOURCES,
  EMPTY_RESULTS,
  useSearchStore,
} from './search-store-state';
import { getRequestedSources, mergeResults } from './search-store-helpers';

const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;
const ipcOn = window.api.on as (channel: string, cb: (...args: unknown[]) => void) => void;
const ipcOff = window.api.off as (channel: string, cb: (...args: unknown[]) => void) => void;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function setSearchQuery(query: string): void {
  useSearchStore.setState({
    query,
    loadedSources: EMPTY_LOADED_SOURCES(),
    hasMoreBySource: EMPTY_HAS_MORE(),
  });
  countPerfEvent('search:query-change');
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  if (!query.trim()) {
    useSearchStore.setState({
      results: EMPTY_RESULTS(),
      sourceErrors: {},
      isSearching: false,
      hasMoreBySource: EMPTY_HAS_MORE(),
    });
    return;
  }

  debounceTimer = setTimeout(
    () =>
      void executeSearch(query.trim(), useSearchStore.getState().activeSource, {
        resetResults: true,
        sources: getRequestedSources(useSearchStore.getState().activeSource),
        offsetBySource: {},
      }),
    SEARCH_DEBOUNCE_MS,
  );
}

export function setActiveSource(source: ActiveTab): void {
  useSearchStore.setState({ activeSource: source });
  const state = useSearchStore.getState();
  const query = state.query.trim();
  if (!query) {
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  const requestedSources = getRequestedSources(source);
  const hasCachedResults = requestedSources.every((requestedSource) => state.loadedSources[requestedSource]);
  if (hasCachedResults) {
    return;
  }

  void executeSearch(query, source, {
    resetResults: false,
    sources: requestedSources,
    offsetBySource: {},
  });
}

export function loadMore(): void {
  const { query, isSearching, activeSource, hasMoreBySource, results } = useSearchStore.getState();
  if (!query.trim() || isSearching) {
    return;
  }

  const requestedSources = getRequestedSources(activeSource).filter((source) => hasMoreBySource[source]);
  if (requestedSources.length === 0) {
    return;
  }

  void executeSearch(query.trim(), activeSource, {
    resetResults: false,
    sources: requestedSources,
    offsetBySource: Object.fromEntries(
      requestedSources.map((source) => [source, results[source].length]),
    ) as Partial<Record<SearchSource, number>>,
  });
}

async function executeSearch(
  query: string,
  activeSource: ActiveTab,
  options: {
    resetResults: boolean;
    sources: SearchSource[];
    offsetBySource: Partial<Record<SearchSource, number>>;
  },
): Promise<void> {
  const requestId = Date.now() + Math.random();
  markPerf('search:start', `${requestId}:${activeSource}:${query}`);
  const { resetResults, sources, offsetBySource } = options;
  const clearedErrors = Object.fromEntries(
    Object.entries(useSearchStore.getState().sourceErrors)
      .filter(([source]) => !sources.includes(source as SearchSource)),
  );

  useSearchStore.setState((prev) => ({
    isSearching: true,
    sourceErrors: clearedErrors,
    results: resetResults ? EMPTY_RESULTS() : prev.results,
    activeRequestId: requestId,
    hasMoreBySource: resetResults ? EMPTY_HAS_MORE() : prev.hasMoreBySource,
    loadedSources: resetResults
      ? EMPTY_LOADED_SOURCES()
      : {
          ...prev.loadedSources,
          ...Object.fromEntries(sources.map((source) => [source, false])),
        },
  }));

  const onSourceResults = (...args: unknown[]) => {
    const data = args[0] as SearchSourceResultsEvent;
    const state = useSearchStore.getState();
    if (data.query === state.query && data.requestId === state.activeRequestId) {
      useSearchStore.setState((prev) => ({
        results: {
          ...prev.results,
          [data.source]: mergeResults(prev.results[data.source], data.results, data.offset),
        },
        hasMoreBySource: {
          ...prev.hasMoreBySource,
          [data.source]: data.hasMore,
        },
      }));
    }
  };

  ipcOn('search:source-results', onSourceResults);

  try {
    const searchQuery: SearchQuery = {
      query,
      sources,
      limitBySource: Object.fromEntries(sources.map((source) => [source, SEARCH_RESULTS_LIMIT])),
      offsetBySource,
      requestId,
    };
    const response = (await ipc('search:query', searchQuery)) as {
      sourceErrors: Record<string, string>;
    };
    const state = useSearchStore.getState();
    if (state.query === query && state.activeRequestId === requestId) {
      markPerf('search:finish', `${requestId}:${activeSource}`);
      useSearchStore.setState((prev) => ({
        sourceErrors: {
          ...clearedErrors,
          ...response.sourceErrors,
        },
        isSearching: false,
        loadedSources: {
          ...prev.loadedSources,
          ...Object.fromEntries(sources.map((source) => [source, true])),
        },
      }));
    }
  } catch {
    if (useSearchStore.getState().activeRequestId === requestId) {
      useSearchStore.setState({ isSearching: false });
    }
  } finally {
    ipcOff('search:source-results', onSourceResults);
  }
}
