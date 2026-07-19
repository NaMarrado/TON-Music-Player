import { useCallback, useMemo, useState } from 'react';
import type { SearchResult, Track } from '@ton/core';
import {
  getSourceCounts,
  getVisibleResults,
  loadMore,
  setActiveSource,
  setSearchQuery,
  setSearchSortMode,
  useSearchStore,
} from '../../stores/search-store';
import { startDownload } from '../../stores/download-store';
import { showToast } from '../../stores/toast-store';
import { playTracks } from '../../audio/playback-service';

export function useSearchPageState(t: (key: string, vars?: Record<string, unknown>) => string) {
  const query = useSearchStore((state) => state.query);
  const isSearching = useSearchStore((state) => state.isSearching);
  const activeSource = useSearchStore((state) => state.activeSource);
  const sourceErrors = useSearchStore((state) => state.sourceErrors);
  const results = useSearchStore((state) => state.results);
  const hasMoreBySource = useSearchStore((state) => state.hasMoreBySource);
  const sortMode = useSearchStore((state) => state.sortMode);

  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('search:dismissed-errors') || '{}');
    } catch {
      return {};
    }
  });

  const dismissBanner = useCallback((source: string) => {
    setDismissed((prev) => {
      const next = { ...prev, [source]: true };
      localStorage.setItem('search:dismissed-errors', JSON.stringify(next));
      return next;
    });
  }, []);

  const visibleResults = useMemo(
    () => getVisibleResults(results, activeSource, query, sortMode),
    [results, activeSource, query, sortMode],
  );
  const counts = useMemo(() => getSourceCounts(results), [results]);
  const canLoadMore = useMemo(() => {
    if (activeSource === 'all') {
      return Object.values(hasMoreBySource).some(Boolean);
    }
    return hasMoreBySource[activeSource];
  }, [activeSource, hasMoreBySource]);

  const handleDownload = useCallback(async (result: SearchResult) => {
    showToast(t('downloadStarted', { title: result.title }), 'success');
    try {
      await startDownload({
        url:
          result.source === 'youtube' || result.source === 'soundcloud'
            ? result.url
            : undefined,
        source: result.source as 'youtube' | 'spotify' | 'soundcloud',
        source_id: result.id,
        title: result.title,
        artist: result.artist,
        album: result.album || undefined,
        cover_url: result.thumbnail_url || undefined,
        duration_ms: result.duration_ms || undefined,
      });
    } catch {
      // Error toast is handled by startDownload
    }
  }, [t]);

  const handlePlayLocal = useCallback((result: SearchResult) => {
    const localResults = visibleResults.filter(
      (item) => item.source === 'local' || item.source === 'playlist',
    );
    const tracks = localResults.map((item) => ({
      id: Number(item.id),
      file_path: item.url,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration_ms: item.duration_ms,
      cover_art_path: item.thumbnail_url,
    })) as Track[];
    const trackIndex = localResults.findIndex(
      (item) => item.id === result.id && item.source === result.source,
    );
    if (trackIndex >= 0) playTracks(tracks, trackIndex);
  }, [visibleResults]);

  return {
    activeSource,
    canLoadMore,
    counts,
    dismissBanner,
    dismissed,
    handleDownload,
    handlePlayLocal,
    isSearching,
    loadMore,
    query,
    setActiveSource,
    setSearchQuery,
    setSearchSortMode,
    sortMode,
    sourceErrors,
    visibleResults,
  };
}
