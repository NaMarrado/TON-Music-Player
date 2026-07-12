import { useCallback, useEffect, useMemo, useState } from 'react';
import { getFilteredTracks } from '@ton/core';
import { useTranslation } from 'react-i18next';
import {
  setFilterQuery,
  setSortBy,
  useLibraryStore,
  loadTracks,
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
  const hasLibraryLoaded = useLibraryStore((state) => state.hasLoaded);
  const sortBy = useLibraryStore((state) => state.sortBy);
  const sortOrder = useLibraryStore((state) => state.sortOrder);
  const filterQuery = useLibraryStore((state) => state.filterQuery);
  const isLoading = useLibraryStore((state) => state.isLoading);
  const playlists = usePlaylistStore((state) => state.playlists);
  const hasPlaylistsLoaded = usePlaylistStore((state) => state.hasLoaded);
  const isPlaylistLoading = usePlaylistStore((state) => state.isLoading);

  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);

  useEffect(() => {
    if (!hasLibraryLoaded && !isLoading) {
      loadTracks().catch(() => {});
    }
    if (!hasPlaylistsLoaded && !isPlaylistLoading) {
      loadPlaylists().catch(() => {});
    }
  }, [hasLibraryLoaded, hasPlaylistsLoaded, isLoading, isPlaylistLoading]);

  const displayTracks = useMemo(
    () => getFilteredTracks(tracks, filterQuery, sortBy, sortOrder),
    [tracks, filterQuery, sortBy, sortOrder],
  );
  const selection = useLibrarySelection(displayTracks);

  const handlePlay = useCallback((index: number) => {
    playTracks(displayTracks, index);
  }, [displayTracks]);

  const handlePlayAll = useCallback(() => {
    if (displayTracks.length > 0) {
      playTracks(displayTracks, 0);
    }
  }, [displayTracks]);

  const handleCreatePlaylist = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    await createPlaylist(trimmedName);
    showToast(t('playlistCreated'), 'success');
    setShowCreatePlaylist(false);
  }, [t]);

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
    isLoading,
    playlists,
    setShowCreatePlaylist,
    setShowSortMenu,
    showCreatePlaylist,
    showSortMenu,
    sortActions,
  };
}

export { setFilterQuery };
