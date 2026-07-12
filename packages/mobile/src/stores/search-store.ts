import { create } from 'zustand';
import type { SearchResult, SearchSource } from '@ton/core';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_RESULTS_LIMIT,
  getVisibleResults,
  getSourceCounts,
} from '@ton/core';
import { countPerfEvent, markPerf } from '../services/perf';
import { executeSearch } from '../services/search-service';
import {
  DEFAULT_SEARCH_SOURCES,
  appendSearchResults,
  appendCompletedSources,
  coversRequestedSources,
  createEmptySearchMoreState,
  createEmptySearchResults,
  mergeSearchMoreState,
  mergeSearchResults,
  mergeSourceErrors,
  splitSearchSources,
} from '../services/search-plan';

type ActiveTab = SearchSource | 'all';

interface SearchState {
  query: string;
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
let requestId = 0;

function getRequestedSources(): SearchSource[] {
  return [...DEFAULT_SEARCH_SOURCES];
}

function isCurrentSearch(
  query: string,
  currentRequestId: number,
  controller: AbortController,
): boolean {
  const state = useSearchStore.getState();
  return (
    state.query.trim() === query
    && state.activeRequestId === currentRequestId
    && !controller.signal.aborted
  );
}

function applySearchPhase(
  query: string,
  currentRequestId: number,
  controller: AbortController,
  updatedSources: SearchSource[],
  phaseResults: Record<SearchSource, SearchResult[]>,
  phaseErrors: Record<string, string>,
  isSearching: boolean,
  pendingSources: SearchSource[],
): boolean {
  if (!isCurrentSearch(query, currentRequestId, controller)) {
    return false;
  }

  useSearchStore.setState((state) => ({
    results: mergeSearchResults(state.results, phaseResults, updatedSources),
    sourceErrors: mergeSourceErrors(state.sourceErrors, phaseErrors, updatedSources),
    hasMoreBySource: mergeSearchMoreState(
      state.hasMoreBySource,
      phaseResults,
      updatedSources,
      SEARCH_RESULTS_LIMIT,
    ),
    isSearching,
    completedSources: appendCompletedSources(state.completedSources, updatedSources),
    pendingSources,
  }));

  return true;
}

export function setSearchQuery(query: string): void {
  useSearchStore.setState({ query });
  countPerfEvent('search:query-change');

  if (debounceTimer) clearTimeout(debounceTimer);

  if (!query.trim()) {
    useSearchStore.setState({
      results: createEmptySearchResults(),
      sourceErrors: {},
      isSearching: false,
      completedSources: [],
      pendingSources: [],
      loadingMoreSources: [],
      hasMoreBySource: createEmptySearchMoreState(),
    });
    activeSearchController?.abort();
    return;
  }

  useSearchStore.setState({ isSearching: true, sourceErrors: {} });
  debounceTimer = setTimeout(() => {
    void runSearch(query.trim(), useSearchStore.getState().activeSource);
  }, SEARCH_DEBOUNCE_MS);
}

async function runSearch(query: string, activeSource: ActiveTab): Promise<void> {
  activeSearchController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;
  const currentRequestId = ++requestId;
  const requestedSources = getRequestedSources();
  const { primarySources, secondarySources } = splitSearchSources(activeSource, requestedSources);
  markPerf('search:start', `${currentRequestId}:${activeSource}:${query}`);
  useSearchStore.setState({
    activeRequestId: currentRequestId,
    isSearching: true,
    sourceErrors: {},
    results: createEmptySearchResults(),
    hasMoreBySource: createEmptySearchMoreState(),
    completedSources: [],
    pendingSources: requestedSources,
    loadingMoreSources: [],
  });

  try {
    const primaryResponse = await executeSearch(query, {
      sources: primarySources,
      signal: controller.signal,
    });

    const appliedPrimary = applySearchPhase(
      query,
      currentRequestId,
      controller,
      primarySources,
      primaryResponse.results,
      primaryResponse.sourceErrors,
      secondarySources.length > 0,
      secondarySources,
    );

    if (appliedPrimary) {
      markPerf('search:finish', `${currentRequestId}:${activeSource}:primary`);
    }

    if (secondarySources.length === 0 || !appliedPrimary) {
      return;
    }

    countPerfEvent('search:secondary-prefetch');
    const secondaryResponse = await executeSearch(query, {
      sources: secondarySources,
      signal: controller.signal,
    });

    const appliedSecondary = applySearchPhase(
      query,
      currentRequestId,
      controller,
      secondarySources,
      secondaryResponse.results,
      secondaryResponse.sourceErrors,
      false,
      [],
    );

    if (appliedSecondary) {
      markPerf('search:finish', `${currentRequestId}:${activeSource}:secondary`);
    } else {
      countPerfEvent('search:secondary-discarded');
    }
  } catch {
    if (isCurrentSearch(query, currentRequestId, controller)) {
      useSearchStore.setState({ isSearching: false });
    }
  } finally {
    if (controller.signal.aborted) {
      markPerf('search:aborted', `${currentRequestId}:${activeSource}`);
    }
    if (activeSearchController === controller) {
      activeSearchController = null;
    }
  }
}

export function setActiveSource(source: ActiveTab): void {
  const state = useSearchStore.getState();
  useSearchStore.setState({ activeSource: source });
  const query = state.query.trim();
  if (!query) {
    return;
  }

  if (source !== 'all' && state.completedSources.includes(source)) {
    return;
  }

  if (
    source === 'all'
    && coversRequestedSources(getRequestedSources(), state.completedSources, state.pendingSources)
  ) {
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void runSearch(query, source);
}

function resolveLoadMoreSource(source?: SearchSource): SearchSource | null {
  if (source) {
    return source;
  }

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
  if (!resolvedSource) {
    return;
  }

  const state = useSearchStore.getState();
  const query = state.query.trim();
  if (
    !query
    || state.isSearching
    || state.loadingMoreSources.includes(resolvedSource)
    || !state.hasMoreBySource[resolvedSource]
  ) {
    return;
  }

  const offset = state.results[resolvedSource].length;
  useSearchStore.setState((current) => ({
    loadingMoreSources: [...new Set([...current.loadingMoreSources, resolvedSource])],
  }));

  try {
    const response = await executeSearch(query, {
      sources: [resolvedSource],
      limit: SEARCH_RESULTS_LIMIT,
      offsetBySource: { [resolvedSource]: offset },
    });

    const latest = useSearchStore.getState();
    if (latest.query.trim() !== query) {
      return;
    }

    useSearchStore.setState((current) => ({
      results: appendSearchResults(current.results, response.results, [resolvedSource]),
      sourceErrors: mergeSourceErrors(
        current.sourceErrors,
        response.sourceErrors,
        [resolvedSource],
      ),
      hasMoreBySource: mergeSearchMoreState(
        current.hasMoreBySource,
        response.results,
        [resolvedSource],
        SEARCH_RESULTS_LIMIT,
      ),
    }));
  } finally {
    removeLoadingMoreSource(resolvedSource);
  }
}

export function getDisplayResults(): SearchResult[] {
  const { results, activeSource, query } = useSearchStore.getState();
  return getVisibleResults(results, activeSource, query);
}

export function getTabCounts(): Record<string, number> {
  return getSourceCounts(useSearchStore.getState().results);
}

export function clearSearch(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  activeSearchController?.abort();
  useSearchStore.setState({
    query: '',
    results: createEmptySearchResults(),
    sourceErrors: {},
    isSearching: false,
    activeSource: 'all',
    activeRequestId: 0,
    completedSources: [],
    pendingSources: [],
    loadingMoreSources: [],
    hasMoreBySource: createEmptySearchMoreState(),
  });
}
