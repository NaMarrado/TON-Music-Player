import { useCallback, useMemo, useState } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';

export function usePlaylistSelection(tracks: PlaylistTrackEntry[]) {
  const [selectedPlaylistTrackIds, setSelectedPlaylistTrackIds] = useState<number[]>([]);

  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedPlaylistTrackIds.includes(track.playlist_track_id)),
    [selectedPlaylistTrackIds, tracks],
  );

  const selectionActive = selectedPlaylistTrackIds.length > 0;

  const clearSelection = useCallback(() => {
    setSelectedPlaylistTrackIds([]);
  }, []);

  const toggleSelection = useCallback((playlistTrackId: number) => {
    setSelectedPlaylistTrackIds((current) => (
      current.includes(playlistTrackId)
        ? current.filter((idValue) => idValue !== playlistTrackId)
        : [...current, playlistTrackId]
    ));
  }, []);

  return {
    clearSelection,
    selectedPlaylistTrackIds,
    selectedTracks,
    selectionActive,
    toggleSelection,
  };
}
