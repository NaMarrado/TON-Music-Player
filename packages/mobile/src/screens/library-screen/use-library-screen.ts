import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getFilteredTracks, matchesTrackFilter } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  isTrackStarred,
  setFilterQuery,
  setSortBy,
  useLibraryStore,
  reconcileLibraryTracks,
} from '../../stores/library-store';
import { createPlaylist, loadPlaylists, usePlaylistStore } from '../../stores/playlist-store';
import { playTracks } from '../../services/playback-bridge';
import { STARRED_LIBRARY_SOURCE_ID } from '../../services/playback-bridge/queue-source-reconcile';
import { showToast } from '../../stores/toast-store';
import type { ActionSheetOption } from '../../components/action-sheet';
import { SORT_KEYS } from './constants';
import { useLibrarySelection } from './use-library-selection';

export function useLibraryScreen() {
  const { t } = useTranslation('library');
  const tracks = useLibraryStore((state) => state.tracks);
  const sortBy = useLibraryStore((state) => state.sortBy);
  const sortOrder = useLibraryStore((state) => state.sortOrder);
  const filterQuery = useLibraryStore((state) => state.filterQuery);
  const starredOnly = useLibraryStore((state) => state.starredOnly);
  const isLoading = useLibraryStore((state) => state.isLoading);
  const playlists = usePlaylistStore((state) => state.playlists);
  const hasPlaylistsLoaded = usePlaylistStore((state) => state.hasLoaded);
  const isPlaylistLoading = usePlaylistStore((state) => state.isLoading);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }).catch(() => {});
    }, []),
  );

  useEffect(() => {
    if (!hasPlaylistsLoaded && !isPlaylistLoading) {
      loadPlaylists().catch(() => {});
    }
  }, [hasPlaylistsLoaded, isPlaylistLoading]);

  // Search only narrows what is shown; playback and the queue follow the whole (optionally starred) Library, like the desktop.
  const playbackTracks = useMemo(
    () => getFilteredTracks(starredOnly ? tracks.filter(isTrackStarred) : tracks, '', sortBy, sortOrder),
    [tracks, sortBy, sortOrder, starredOnly],
  );
  const displayTracks = useMemo(
    () => (filterQuery ? playbackTracks.filter((track) => matchesTrackFilter(track, filterQuery)) : playbackTracks),
    [playbackTracks, filterQuery],
  );
  const queueSource = useMemo(() => ({
    kind: 'library' as const,
    ...(starredOnly ? { source_id: STARRED_LIBRARY_SOURCE_ID } : {}),
    sort_by: sortBy,
    sort_order: sortOrder,
  }), [sortBy, sortOrder, starredOnly]);
  const selection = useLibrarySelection(displayTracks, playbackTracks, queueSource);

  const handlePlayAll = useCallback(() => {
    if (playbackTracks.length > 0) {
      playTracks(playbackTracks, 0, queueSource);
    }
  }, [playbackTracks, queueSource]);

  const handleCreatePlaylist = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    await createPlaylist(trimmedName);
    showToast(t('playlistCreated'), 'success');
    setShowCreatePlaylist(false);
  }, [t]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        reconcileLibraryTracks({ immediate: true, loadIfUninitialized: true }),
        loadPlaylists(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const sortActions: ActionSheetOption[] = SORT_KEYS.map((option) => ({
    label: `${t(option.key)}${sortBy === option.field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}`,
    icon: sortBy === option.field ? 'check' : 'minus',
    onPress: () => setSortBy(option.field),
  }));

  return {
    displayTracks,
    filterQuery,
    ...selection,
    handleCreatePlaylist,
    handlePlayAll,
    handleRefresh,
    isLoading,
    isRefreshing,
    starredOnly,
    playlists,
    setShowCreatePlaylist,
    setShowSortMenu,
    showCreatePlaylist,
    showSortMenu,
    sortActions,
  };
}

export { setFilterQuery };
