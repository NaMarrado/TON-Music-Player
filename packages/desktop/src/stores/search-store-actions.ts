import {
  SEARCH_DEBOUNCE_MS,
  canonicalizeSearchQuery,
  createSearchRequestIdGenerator,
  getSearchPageLimit,
  isCurrentSearchRequest,
  type SearchQuery,
  type SearchSource,
  type SearchSourceEvent,
} from '@ton/core';
import { countPerfEvent, markPerf } from '../utils/perf';
import type { ActiveTab } from './search-store-types';
import {
  EMPTY_HAS_MORE,
  EMPTY_LOADED_SOURCES,
  EMPTY_RESULTS,
  useSearchStore,
} from './search-store-state';
import { getRequestedSources, mergeResults } from './search-store-helpers';

const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;
const ipcOn = window.api.on as (channel: string, cb: (...args: unknown[]) => void) => void;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const nextRequestId = createSearchRequestIdGenerator(Date.now());
let listenerRegistered = false;

function cancelRequest(requestId: number): void {
  if (requestId > 0) void ipc('search:cancel', requestId).catch(() => {});
}

function handleSourceEvent(...args: unknown[]): void {
  const event = args[0] as SearchSourceEvent;
  const state = useSearchStore.getState();
  if (!event || !isCurrentSearchRequest(state.activeRequestId, event.requestId)) return;

  useSearchStore.setState((previous) => {
    const pendingSources = previous.pendingSources.filter((source) => source !== event.source);
    const sourceErrors = { ...previous.sourceErrors };
    if (event.status === 'error' && event.error) sourceErrors[event.source] = event.error;
    else delete sourceErrors[event.source];

    return {
      results: event.status === 'success'
        ? {
            ...previous.results,
            [event.source]: mergeResults(
              previous.results[event.source],
              event.results,
              event.offset,
            ),
          }
        : previous.results,
      sourceErrors,
      hasMoreBySource: {
        ...previous.hasMoreBySource,
        [event.source]: event.status === 'success' && event.hasMore,
      },
      loadedSources: {
        ...previous.loadedSources,
        [event.source]: event.status !== 'cancelled',
      },
      pendingSources,
      isSearching: pendingSources.length > 0,
    };
  });

  if (useSearchStore.getState().pendingSources.length === 0) {
    markPerf('search:finish', String(event.requestId));
  }
}

function ensureSearchListener(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;
  ipcOn('search:source-results', handleSourceEvent);
}

ensureSearchListener();

export function setSearchQuery(rawQuery: string): void {
  const previousRequestId = useSearchStore.getState().activeRequestId;
  const requestId = nextRequestId();
  const effectiveQuery = canonicalizeSearchQuery(rawQuery);
  cancelRequest(previousRequestId);
  countPerfEvent('search:query-change');

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (!effectiveQuery) {
    useSearchStore.setState({
      query: rawQuery,
      effectiveQuery,
      activeRequestId: requestId,
      results: EMPTY_RESULTS(),
      sourceErrors: {},
      isSearching: false,
      loadedSources: EMPTY_LOADED_SOURCES(),
      hasMoreBySource: EMPTY_HAS_MORE(),
      pendingSources: [],
    });
    return;
  }

  const activeSource = useSearchStore.getState().activeSource;
  const sources = getRequestedSources(activeSource);
  useSearchStore.setState({
    query: rawQuery,
    effectiveQuery,
    activeRequestId: requestId,
    results: EMPTY_RESULTS(),
    sourceErrors: {},
    isSearching: true,
    loadedSources: EMPTY_LOADED_SOURCES(),
    hasMoreBySource: EMPTY_HAS_MORE(),
    pendingSources: sources,
  });

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void executeSearch(effectiveQuery, activeSource, requestId, {
      resetResults: true,
      sources,
      offsetBySource: {},
    });
  }, SEARCH_DEBOUNCE_MS);
}

export function setActiveSource(source: ActiveTab): void {
  const state = useSearchStore.getState();
  const requestId = nextRequestId();
  cancelRequest(state.activeRequestId);
  useSearchStore.setState({ activeSource: source, activeRequestId: requestId });
  if (!state.effectiveQuery) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const sources = getRequestedSources(source).filter(
    (requestedSource) => !state.loadedSources[requestedSource],
  );
  if (sources.length === 0) {
    useSearchStore.setState({ isSearching: false, pendingSources: [] });
    return;
  }

  void executeSearch(state.effectiveQuery, source, requestId, {
    resetResults: false,
    sources,
    offsetBySource: {},
  });
}

export function loadMore(): void {
  const state = useSearchStore.getState();
  if (!state.effectiveQuery || state.isSearching) return;

  const sources = getRequestedSources(state.activeSource).filter(
    (source) => state.hasMoreBySource[source],
  );
  if (sources.length === 0) return;

  const requestId = nextRequestId();
  cancelRequest(state.activeRequestId);
  void executeSearch(state.effectiveQuery, state.activeSource, requestId, {
    resetResults: false,
    sources,
    offsetBySource: Object.fromEntries(
      sources.map((source) => [source, state.results[source].length]),
    ) as Partial<Record<SearchSource, number>>,
  });
}

async function executeSearch(
  query: string,
  activeSource: ActiveTab,
  requestId: number,
  options: {
    resetResults: boolean;
    sources: SearchSource[];
    offsetBySource: Partial<Record<SearchSource, number>>;
  },
): Promise<void> {
  ensureSearchListener();
  markPerf('search:start', `${requestId}:${activeSource}:${query}`);
  const { resetResults, sources, offsetBySource } = options;
  const clearedErrors = Object.fromEntries(
    Object.entries(useSearchStore.getState().sourceErrors)
      .filter(([source]) => !sources.includes(source as SearchSource)),
  );

  useSearchStore.setState((previous) => ({
    activeRequestId: requestId,
    isSearching: true,
    pendingSources: sources,
    sourceErrors: clearedErrors,
    results: resetResults ? EMPTY_RESULTS() : previous.results,
    hasMoreBySource: resetResults ? EMPTY_HAS_MORE() : previous.hasMoreBySource,
    loadedSources: resetResults
      ? EMPTY_LOADED_SOURCES()
      : {
          ...previous.loadedSources,
          ...Object.fromEntries(sources.map((source) => [source, false])),
        },
  }));

  const searchQuery: SearchQuery = {
    query,
    sources,
    limitBySource: Object.fromEntries(
      sources.map((source) => [source, getSearchPageLimit(source)]),
    ),
    offsetBySource,
    requestId,
  };

  try {
    await ipc('search:query', searchQuery);
    if (useSearchStore.getState().activeRequestId === requestId) {
      useSearchStore.setState({ isSearching: false, pendingSources: [] });
    }
  } catch {
    if (useSearchStore.getState().activeRequestId === requestId) {
      useSearchStore.setState({ isSearching: false, pendingSources: [] });
    }
  }
}
