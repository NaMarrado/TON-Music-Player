import { create } from 'zustand';
import {
  SEARCH_DEBOUNCE_MS,
  canonicalizeSearchQuery,
  createSearchRequestIdGenerator,
  getSearchPageLimit,
  getSourceCounts,
  getVisibleResults,
  type SearchResult,
  type SearchSource,
} from '@ton/core';
import { countPerfEvent, markPerf } from '../services/perf';
import {
  executeSearch,
  type MobileSearchSourceEvent,
} from '../services/search-service';
import {
  DEFAULT_SEARCH_SOURCES,
  appendCompletedSources,
  appendSearchResults,
  createEmptySearchMoreState,
  createEmptySearchResults,
  mergeSearchResults,
  mergeSourceErrors,
} from '../services/search-plan';

type ActiveTab = SearchSource | 'all';

interface SearchState {
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

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeSearchController: AbortController | null = null;
const nextRequestId = createSearchRequestIdGenerator();

function getRequestedSources(): SearchSource[] {
  return [...DEFAULT_SEARCH_SOURCES];
}

function isCurrentSearch(
  query: string,
  requestId: number,
  controller: AbortController,
): boolean {
  const state = useSearchStore.getState();
  return state.effectiveQuery === query
    && state.activeRequestId === requestId
    && !controller.signal.aborted;
}

function applySourceEvent(
  query: string,
  requestId: number,
  controller: AbortController,
  event: MobileSearchSourceEvent,
): void {
  if (!isCurrentSearch(query, requestId, controller)) return;

  useSearchStore.setState((state) => {
    const pendingSources = state.pendingSources.filter((source) => source !== event.source);
    const nextResults = createEmptySearchResults();
    nextResults[event.source] = event.results;
    const nextErrors = event.error ? { [event.source]: event.error } : {};

    return {
      results: event.status === 'success'
        ? mergeSearchResults(state.results, nextResults, [event.source])
        : state.results,
      sourceErrors: mergeSourceErrors(state.sourceErrors, nextErrors, [event.source]),
      hasMoreBySource: {
        ...state.hasMoreBySource,
        [event.source]: event.status === 'success' && event.hasMore,
      },
      completedSources: event.status === 'cancelled'
        ? state.completedSources
        : appendCompletedSources(state.completedSources, [event.source]),
      pendingSources,
      isSearching: pendingSources.length > 0,
    };
  });
}

export function setSearchQuery(rawQuery: string): void {
  const effectiveQuery = canonicalizeSearchQuery(rawQuery);
  const requestId = nextRequestId();
  activeSearchController?.abort();
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
      results: createEmptySearchResults(),
      sourceErrors: {},
      isSearching: false,
      completedSources: [],
      pendingSources: [],
      loadingMoreSources: [],
      hasMoreBySource: createEmptySearchMoreState(),
    });
    return;
  }

  useSearchStore.setState({
    query: rawQuery,
    effectiveQuery,
    activeRequestId: requestId,
    isSearching: true,
    sourceErrors: {},
    results: createEmptySearchResults(),
    completedSources: [],
    pendingSources: getRequestedSources(),
    loadingMoreSources: [],
    hasMoreBySource: createEmptySearchMoreState(),
  });
  const activeSource = useSearchStore.getState().activeSource;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runSearch(effectiveQuery, activeSource, requestId);
  }, SEARCH_DEBOUNCE_MS);
}

async function runSearch(
  query: string,
  activeSource: ActiveTab,
  requestId: number,
): Promise<void> {
  if (useSearchStore.getState().activeRequestId !== requestId) return;
  activeSearchController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;
  const snapshot = useSearchStore.getState();
  const requestedSources = getRequestedSources().filter(
    (source) => !snapshot.completedSources.includes(source),
  );
  if (requestedSources.length === 0) {
    useSearchStore.setState({ isSearching: false, pendingSources: [] });
    activeSearchController = null;
    return;
  }
  markPerf('search:start', `${requestId}:${activeSource}:${query}`);
  useSearchStore.setState({
    isSearching: true,
    pendingSources: requestedSources,
    loadingMoreSources: [],
  });

  try {
    await executeSearch(query, {
      sources: requestedSources,
      signal: controller.signal,
      limitBySource: Object.fromEntries(
        requestedSources.map((source) => [source, getSearchPageLimit(source)]),
      ),
      onSourceSettled: (event) => applySourceEvent(query, requestId, controller, event),
    });
    if (isCurrentSearch(query, requestId, controller)) {
      useSearchStore.setState({ isSearching: false, pendingSources: [] });
      markPerf('search:finish', `${requestId}:${activeSource}`);
    }
  } catch {
    if (isCurrentSearch(query, requestId, controller)) {
      useSearchStore.setState({ isSearching: false, pendingSources: [] });
    }
  } finally {
    if (controller.signal.aborted) markPerf('search:aborted', `${requestId}:${activeSource}`);
    if (activeSearchController === controller) activeSearchController = null;
  }
}

export function setActiveSource(source: ActiveTab): void {
  const state = useSearchStore.getState();
  const requestId = nextRequestId();
  activeSearchController?.abort();
  useSearchStore.setState({
    activeSource: source,
    activeRequestId: requestId,
    loadingMoreSources: [],
  });
  if (!state.effectiveQuery) return;

  if (source !== 'all' && state.completedSources.includes(source)) {
    useSearchStore.setState({ isSearching: false, pendingSources: [] });
    return;
  }
  if (
    source === 'all'
    && getRequestedSources().every((requestedSource) => (
      state.completedSources.includes(requestedSource)
    ))
  ) {
    useSearchStore.setState({ isSearching: false, pendingSources: [] });
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void runSearch(state.effectiveQuery, source, requestId);
}

function resolveLoadMoreSource(source?: SearchSource): SearchSource | null {
  if (source) return source;
  const activeSource = useSearchStore.getState().activeSource;
  return activeSource === 'all' ? null : activeSource;
}

function removeLoadingMoreSource(source: SearchSource): void {
  useSearchStore.setState((state) => ({
    loadingMoreSources: state.loadingMoreSources.filter((item) => item !== source),
  }));
}

export async function loadMoreSearchResults(source?: SearchSource): Promise<void> {
  const resolvedSource = resolveLoadMoreSource(source);
  if (!resolvedSource) return;

  const state = useSearchStore.getState();
  if (
    !state.effectiveQuery
    || state.isSearching
    || state.loadingMoreSources.includes(resolvedSource)
    || !state.hasMoreBySource[resolvedSource]
  ) return;

  const requestId = nextRequestId();
  const controller = new AbortController();
  activeSearchController?.abort();
  activeSearchController = controller;
  const offset = state.results[resolvedSource].length;
  useSearchStore.setState({
    activeRequestId: requestId,
    loadingMoreSources: [resolvedSource],
  });

  try {
    const response = await executeSearch(state.effectiveQuery, {
      sources: [resolvedSource],
      limitBySource: { [resolvedSource]: getSearchPageLimit(resolvedSource) },
      offsetBySource: { [resolvedSource]: offset },
      signal: controller.signal,
    });
    const latest = useSearchStore.getState();
    if (
      latest.activeRequestId !== requestId
      || latest.effectiveQuery !== state.effectiveQuery
      || controller.signal.aborted
    ) return;

    useSearchStore.setState((current) => ({
      results: appendSearchResults(current.results, response.results, [resolvedSource]),
      sourceErrors: mergeSourceErrors(
        current.sourceErrors,
        response.sourceErrors,
        [resolvedSource],
      ),
      hasMoreBySource: {
        ...current.hasMoreBySource,
        [resolvedSource]: response.hasMoreBySource[resolvedSource],
      },
    }));
  } catch {
    // A newer edit/tab/load-more request owns the UI now. Abort is not a user-facing error.
  } finally {
    if (useSearchStore.getState().activeRequestId === requestId) {
      removeLoadingMoreSource(resolvedSource);
    }
    if (activeSearchController === controller) activeSearchController = null;
  }
}

export function getDisplayResults(): SearchResult[] {
  const { results, activeSource, effectiveQuery } = useSearchStore.getState();
  return getVisibleResults(results, activeSource, effectiveQuery);
}

export function getTabCounts(): Record<string, number> {
  return getSourceCounts(useSearchStore.getState().results);
}

export function clearSearch(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  activeSearchController?.abort();
  useSearchStore.setState({
    query: '',
    effectiveQuery: '',
    results: createEmptySearchResults(),
    sourceErrors: {},
    isSearching: false,
    activeSource: 'all',
    activeRequestId: nextRequestId(),
    completedSources: [],
    pendingSources: [],
    loadingMoreSources: [],
    hasMoreBySource: createEmptySearchMoreState(),
  });
}
