import { useCallback, useMemo, useState } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';

export function usePlaylistSelection(tracks: PlaylistTrackEntry[]) {
  const [selectedPlaylistTrackIds, setSelectedPlaylistTrackIds] = useState<number[]>([]);
  const selectedPlaylistTrackIdSet = useMemo(
    () => new Set(selectedPlaylistTrackIds),
    [selectedPlaylistTrackIds],
  );

  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedPlaylistTrackIdSet.has(track.playlist_track_id)),
    [selectedPlaylistTrackIdSet, tracks],
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
    selectedPlaylistTrackIdSet,
    selectedTracks,
    selectionActive,
    toggleSelection,
  };
}
