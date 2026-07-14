import type { SearchResult, SearchSource } from '@ton/core';

export type ActiveSearchSource = SearchSource | 'all';

export const DEFAULT_SEARCH_SOURCES: SearchSource[] = ['youtube', 'spotify', 'local', 'playlist'];

export function createEmptySearchResults(): Record<SearchSource, SearchResult[]> {
  return {
    youtube: [],
    spotify: [],
    soundcloud: [],
    local: [],
    playlist: [],
  };
}

export function createEmptySearchMoreState(): Record<SearchSource, boolean> {
  return {
    youtube: false,
    spotify: false,
    soundcloud: false,
    local: false,
    playlist: false,
  };
}

export function splitSearchSources(
  activeSource: ActiveSearchSource,
  requestedSources: SearchSource[],
): {
  primarySources: SearchSource[];
  secondarySources: SearchSource[];
} {
  if (activeSource === 'all') {
    const primarySources: SearchSource[] = requestedSources.filter(
      (source) => source === 'local' || source === 'playlist',
    );
    if (primarySources.length === 0) {
      return { primarySources: requestedSources, secondarySources: [] };
    }

    return {
      primarySources,
      secondarySources: requestedSources.filter((source) => !primarySources.includes(source)),
    };
  }

  if (!requestedSources.includes(activeSource)) {
    return { primarySources: requestedSources, secondarySources: [] };
  }

  return {
    primarySources: [activeSource],
    secondarySources: requestedSources.filter((source) => source !== activeSource),
  };
}

export function mergeSearchResults(
  currentResults: Record<SearchSource, SearchResult[]>,
  nextResults: Record<SearchSource, SearchResult[]>,
  updatedSources: SearchSource[],
): Record<SearchSource, SearchResult[]> {
  const mergedResults = { ...currentResults };

  for (const source of updatedSources) {
    mergedResults[source] = nextResults[source];
  }

  return mergedResults;
}

export function appendSearchResults(
  currentResults: Record<SearchSource, SearchResult[]>,
  nextResults: Record<SearchSource, SearchResult[]>,
  updatedSources: SearchSource[],
): Record<SearchSource, SearchResult[]> {
  const mergedResults = { ...currentResults };

  for (const source of updatedSources) {
    const existing = currentResults[source] ?? [];
    const existingKeys = new Set(existing.map((result) => `${result.source}:${result.id}`));
    const appended = (nextResults[source] ?? []).filter((result) => {
      const key = `${result.source}:${result.id}`;
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });
    mergedResults[source] = [...existing, ...appended];
  }

  return mergedResults;
}

export function mergeSearchMoreState(
  currentState: Record<SearchSource, boolean>,
  nextStateBySource: Record<SearchSource, boolean>,
  updatedSources: SearchSource[],
): Record<SearchSource, boolean> {
  const nextState = { ...currentState };

  for (const source of updatedSources) {
    nextState[source] = nextStateBySource[source] ?? false;
  }

  return nextState;
}

export function mergeSourceErrors(
  currentErrors: Record<string, string>,
  nextErrors: Record<string, string>,
  updatedSources: SearchSource[],
): Record<string, string> {
  const mergedErrors = { ...currentErrors };

  for (const source of updatedSources) {
    if (nextErrors[source]) {
      mergedErrors[source] = nextErrors[source];
    } else {
      delete mergedErrors[source];
    }
  }

  return mergedErrors;
}

export function appendCompletedSources(
  currentSources: SearchSource[],
  nextSources: SearchSource[],
): SearchSource[] {
  return Array.from(new Set([...currentSources, ...nextSources]));
}

export function coversRequestedSources(
  requestedSources: SearchSource[],
  completedSources: SearchSource[],
  pendingSources: SearchSource[],
): boolean {
  return requestedSources.every(
    (source) => completedSources.includes(source) || pendingSources.includes(source),
  );
}
