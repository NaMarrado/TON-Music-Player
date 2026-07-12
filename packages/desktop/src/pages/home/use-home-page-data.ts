import { useEffect, useMemo, useState } from 'react';
import type { Track } from '@ton/core';
import { loadPlaylists, usePlaylistStore } from '../../stores/playlist-store';

export function useHomePageData() {
  const playlists = usePlaylistStore((state) => state.playlists);
  const hasPlaylistsLoaded = usePlaylistStore((state) => state.hasLoaded);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [libraryCount, setLibraryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!hasPlaylistsLoaded) {
      void loadPlaylists();
    }
  }, [hasPlaylistsLoaded]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    window.api.invoke('library:home-summary')
      .then((summary) => {
        if (cancelled) {
          return;
        }

        setLibraryCount(summary.libraryCount);
        setRecentTracks(summary.recentTracks);
        setRecentlyPlayed(summary.recentlyPlayed);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const recentPlaylists = useMemo(() => playlists.slice(0, 8), [playlists]);
  return {
    isEmpty: libraryCount === 0 && recentPlaylists.length === 0 && !isLoading,
    recentPlaylists,
    recentTracks,
    recentlyPlayed,
  };
}
