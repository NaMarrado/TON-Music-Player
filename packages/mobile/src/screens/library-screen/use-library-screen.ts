import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getFilteredTracks } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  setFilterQuery,
  setSortBy,
  useLibraryStore,
  reconcileLibraryTracks,
} from '../../stores/library-store';
import { createPlaylist, loadPlaylists, usePlaylistStore } from '../../stores/playlist-store';
import { playTracks } from '../../services/playback-bridge';
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

  const displayTracks = useMemo(
    () => getFilteredTracks(tracks, filterQuery, sortBy, sortOrder),
    [tracks, filterQuery, sortBy, sortOrder],
  );
  const queueSource = useMemo(() => ({
    kind: 'library' as const,
    filter_query: filterQuery || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
  }), [filterQuery, sortBy, sortOrder]);
  const selection = useLibrarySelection(displayTracks, queueSource);

  const handlePlay = useCallback((index: number) => {
    playTracks(displayTracks, index, queueSource);
  }, [displayTracks, queueSource]);

  const handlePlayAll = useCallback(() => {
    if (displayTracks.length > 0) {
      playTracks(displayTracks, 0, queueSource);
    }
  }, [displayTracks, queueSource]);

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
    handlePlay,
    handlePlayAll,
    handleRefresh,
    isLoading,
    isRefreshing,
    playlists,
    setShowCreatePlaylist,
    setShowSortMenu,
    showCreatePlaylist,
    showSortMenu,
    sortActions,
  };
}

export { setFilterQuery };
