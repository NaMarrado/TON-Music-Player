import {
  SEARCH_DEBOUNCE_MS,
  canonicalizeSearchQuery,
  getSearchPageLimit,
  parseDirectTrackUrl,
} from '@ton/core';
import { countPerfEvent, markPerf } from '../services/perf';
import { executeSearch, type MobileSearchSourceEvent } from '../services/search-service';
import {
  DEFAULT_SEARCH_SOURCES,
  appendCompletedSources,
  createEmptySearchMoreState,
  createEmptySearchResults,
  mergeSearchResults,
  mergeSourceErrors,
} from '../services/search-plan';
import { searchRuntime, useSearchStore, type ActiveTab } from './search-store-state';

export { useSearchStore } from './search-store-state';
export { loadMoreSearchResults } from './search-store-load-more';
export { getDisplayResults, getTabCounts } from './search-store-selectors';

function isCurrentSearch(query: string, requestId: number, controller: AbortController): boolean {
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
    return {
      results: event.status === 'success'
        ? mergeSearchResults(state.results, nextResults, [event.source])
        : state.results,
      sourceErrors: mergeSourceErrors(
        state.sourceErrors, event.error ? { [event.source]: event.error } : {}, [event.source],
      ),
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

async function runSearch(query: string, activeSource: ActiveTab, requestId: number): Promise<void> {
  if (useSearchStore.getState().activeRequestId !== requestId) return;
  searchRuntime.activeController?.abort();
  const controller = new AbortController();
  searchRuntime.activeController = controller;
  const directTrack = parseDirectTrackUrl(query);
  const availableSources = directTrack ? [directTrack.source] : DEFAULT_SEARCH_SOURCES;
  const requestedSources = availableSources.filter(
    (source) => !useSearchStore.getState().completedSources.includes(source),
  );
  if (requestedSources.length === 0) {
    useSearchStore.setState({ isSearching: false, pendingSources: [] });
    searchRuntime.activeController = null;
    return;
  }
  markPerf('search:start', `${requestId}:${activeSource}:${query}`);
  useSearchStore.setState({ isSearching: true, pendingSources: requestedSources, loadingMoreSources: [] });
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
    if (searchRuntime.activeController === controller) searchRuntime.activeController = null;
  }
}

export function setSearchQuery(rawQuery: string): void {
  const effectiveQuery = canonicalizeSearchQuery(rawQuery);
  const directTrack = parseDirectTrackUrl(effectiveQuery);
  const requestId = searchRuntime.nextRequestId();
  searchRuntime.activeController?.abort();
  countPerfEvent('search:query-change');
  if (searchRuntime.debounceTimer) clearTimeout(searchRuntime.debounceTimer);
  searchRuntime.debounceTimer = null;
  if (!effectiveQuery) {
    useSearchStore.setState({
      query: rawQuery, effectiveQuery, activeRequestId: requestId,
      results: createEmptySearchResults(), sourceErrors: {}, isSearching: false,
      completedSources: [], pendingSources: [], loadingMoreSources: [],
      hasMoreBySource: createEmptySearchMoreState(),
    });
    return;
  }
  useSearchStore.setState({
    query: rawQuery, effectiveQuery, activeRequestId: requestId,
    activeSource: directTrack ? 'all' : useSearchStore.getState().activeSource,
    isSearching: true,
    sourceErrors: {}, results: createEmptySearchResults(), completedSources: [],
    pendingSources: directTrack ? [directTrack.source] : [...DEFAULT_SEARCH_SOURCES],
    hasMoreBySource: createEmptySearchMoreState(),
  });
  const activeSource = directTrack ? 'all' : useSearchStore.getState().activeSource;
  searchRuntime.debounceTimer = setTimeout(() => {
    searchRuntime.debounceTimer = null;
    void runSearch(effectiveQuery, activeSource, requestId);
  }, SEARCH_DEBOUNCE_MS);
}

export function setActiveSource(source: ActiveTab): void {
  const state = useSearchStore.getState();
  const requestId = searchRuntime.nextRequestId();
  searchRuntime.activeController?.abort();
  useSearchStore.setState({ activeSource: source, activeRequestId: requestId, loadingMoreSources: [] });
  if (!state.effectiveQuery) return;
  if ((source !== 'all' && state.completedSources.includes(source))
      || (source === 'all' && DEFAULT_SEARCH_SOURCES.every(
        (requestedSource) => state.completedSources.includes(requestedSource),
      ))) {
    useSearchStore.setState({ isSearching: false, pendingSources: [] });
    return;
  }
  if (searchRuntime.debounceTimer) clearTimeout(searchRuntime.debounceTimer);
  searchRuntime.debounceTimer = null;
  void runSearch(state.effectiveQuery, source, requestId);
}

export function clearSearch(): void {
  if (searchRuntime.debounceTimer) clearTimeout(searchRuntime.debounceTimer);
  searchRuntime.debounceTimer = null;
  searchRuntime.activeController?.abort();
  useSearchStore.setState({
    query: '', effectiveQuery: '', results: createEmptySearchResults(), sourceErrors: {},
    isSearching: false, activeSource: 'all', activeRequestId: searchRuntime.nextRequestId(),
    completedSources: [], pendingSources: [], loadingMoreSources: [],
    hasMoreBySource: createEmptySearchMoreState(),
  });
}
