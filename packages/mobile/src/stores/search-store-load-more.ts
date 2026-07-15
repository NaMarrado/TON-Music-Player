import { getSearchPageLimit, type SearchSource } from '@ton/core';
import { executeSearch } from '../services/search-service';
import { appendSearchResults, mergeSourceErrors } from '../services/search-plan';
import { searchRuntime, useSearchStore } from './search-store-state';

function resolveLoadMoreSource(source?: SearchSource): SearchSource | null {
  if (source) return source;
  const activeSource = useSearchStore.getState().activeSource;
  return activeSource === 'all' ? null : activeSource;
}

export async function loadMoreSearchResults(source?: SearchSource): Promise<void> {
  const resolvedSource = resolveLoadMoreSource(source);
  if (!resolvedSource) return;
  const state = useSearchStore.getState();
  if (!state.effectiveQuery
      || state.isSearching
      || state.loadingMoreSources.includes(resolvedSource)
      || !state.hasMoreBySource[resolvedSource]) return;

  const requestId = searchRuntime.nextRequestId();
  const controller = new AbortController();
  searchRuntime.activeController?.abort();
  searchRuntime.activeController = controller;
  useSearchStore.setState({ activeRequestId: requestId, loadingMoreSources: [resolvedSource] });
  try {
    const response = await executeSearch(state.effectiveQuery, {
      sources: [resolvedSource],
      limitBySource: { [resolvedSource]: getSearchPageLimit(resolvedSource) },
      offsetBySource: { [resolvedSource]: state.results[resolvedSource].length },
      signal: controller.signal,
    });
    const latest = useSearchStore.getState();
    if (latest.activeRequestId !== requestId
        || latest.effectiveQuery !== state.effectiveQuery
        || controller.signal.aborted) return;
    useSearchStore.setState((current) => ({
      results: appendSearchResults(current.results, response.results, [resolvedSource]),
      sourceErrors: mergeSourceErrors(
        current.sourceErrors, response.sourceErrors, [resolvedSource],
      ),
      hasMoreBySource: {
        ...current.hasMoreBySource,
        [resolvedSource]: response.hasMoreBySource[resolvedSource],
      },
    }));
  } catch {
    // A newer request owns the UI now.
  } finally {
    if (useSearchStore.getState().activeRequestId === requestId) {
      useSearchStore.setState((current) => ({
        loadingMoreSources: current.loadingMoreSources.filter((item) => item !== resolvedSource),
      }));
    }
    if (searchRuntime.activeController === controller) searchRuntime.activeController = null;
  }
}
