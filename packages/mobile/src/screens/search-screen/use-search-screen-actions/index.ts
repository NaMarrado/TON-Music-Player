import { useMemo, useState } from 'react';
import type { SearchResult } from '@ton/core';
import { buildResultActions } from './result-actions';
import { useSearchDerivedState } from './derived-state';
import { useSearchResultHandlers } from './result-handlers';
import type { UseSearchScreenActionsArgs } from './types';

export function useSearchScreenActions({
  activeSource,
  query,
  results,
  sourceErrors,
  t,
}: UseSearchScreenActionsArgs) {
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [dismissedErrors, setDismissedErrors] = useState<Record<string, boolean>>({});
  const [playlistPickerTrackId, setPlaylistPickerTrackId] = useState<number | null>(null);
  const { counts, displayResults } = useSearchDerivedState(activeSource, query, results);
  const handlers = useSearchResultHandlers(t);

  const resultActions = useMemo(
    () =>
      buildResultActions({
        ...handlers,
        selectedResult,
        setPlaylistPickerTrackId,
        t,
      }),
    [handlers, selectedResult, setPlaylistPickerTrackId, t],
  );

  return {
    counts,
    dismissSpotifyError: () =>
      setDismissedErrors((prev) => ({ ...prev, spotify: true })),
    displayResults,
    handleResultPress: handlers.handleResultPress,
    handleRowAction: handlers.handleRowAction,
    playlistPickerTrackId,
    resultActions,
    selectedResult,
    setPlaylistPickerTrackId,
    setSelectedResult,
    spotifyError: !!sourceErrors.spotify && !dismissedErrors.spotify,
  };
}
