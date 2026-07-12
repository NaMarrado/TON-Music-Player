import { useCallback, useEffect, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getMostPlayed, getRecentlyPlayed } from '@ton/core';
import type { Track } from '@ton/core';
import type { HomeStackParamList, TabParamList } from '../../types/navigation';
import { loadTracks, useLibraryStore } from '../../stores/library-store';
import { loadPlaylists, usePlaylistStore } from '../../stores/playlist-store';
import { playSingleTrack } from '../../services/playback-bridge';

export function useHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const tracks = useLibraryStore((state) => state.tracks);
  const hasLibraryLoaded = useLibraryStore((state) => state.hasLoaded);
  const isLibraryLoading = useLibraryStore((state) => state.isLoading);
  const playlists = usePlaylistStore((state) => state.playlists);
  const hasPlaylistsLoaded = usePlaylistStore((state) => state.hasLoaded);
  const isPlaylistLoading = usePlaylistStore((state) => state.isLoading);

  useEffect(() => {
    if (!hasLibraryLoaded && !isLibraryLoading) {
      loadTracks().catch(() => {});
    }
    if (!hasPlaylistsLoaded && !isPlaylistLoading) {
      loadPlaylists().catch(() => {});
    }
  }, [hasLibraryLoaded, hasPlaylistsLoaded, isLibraryLoading, isPlaylistLoading]);

  const recentlyPlayed = useMemo(() => getRecentlyPlayed(tracks, 10), [tracks]);
  const mostPlayed = useMemo(() => getMostPlayed(tracks, 10), [tracks]);
  const recentlyAdded = useMemo(
    () => [...tracks].sort((a, b) => b.added_at - a.added_at).slice(0, 10),
    [tracks],
  );

  const handleTrackPress = useCallback((track: Track) => {
    playSingleTrack(track);
  }, []);

  const navigateToSearch = useCallback(() => {
    navigation
      .getParent<NavigationProp<TabParamList>>()
      ?.navigate('SearchTab', { screen: 'Search' });
  }, [navigation]);

  const navigateToPlaylist = useCallback(
    (id: number) => {
      navigation.navigate('Playlist', { id });
    },
    [navigation],
  );

  return {
    hasLibraryLoaded,
    mostPlayed,
    navigateToPlaylist,
    navigateToSearch,
    playlists,
    recentlyAdded,
    recentlyPlayed,
    tracks,
    isLibraryLoading,
    handleTrackPress,
  };
}
