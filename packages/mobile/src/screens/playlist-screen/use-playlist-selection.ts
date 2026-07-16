import { useCallback, useMemo, useState } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';

export function usePlaylistSelection(tracks: PlaylistTrackEntry[]) {
  const [selectedPlaylistTrackIds, setSelectedPlaylistTrackIds] = useState<number[]>([]);
  const [selectionRevision, setSelectionRevision] = useState(0);
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
    setSelectedPlaylistTrackIds((current) => {
      if (current.length === 0) return current;
      setSelectionRevision((revision) => revision + 1);
      return [];
    });
  }, []);

  const toggleSelection = useCallback((playlistTrackId: number) => {
    setSelectedPlaylistTrackIds((current) => {
      setSelectionRevision((revision) => revision + 1);
      return current.includes(playlistTrackId)
        ? current.filter((idValue) => idValue !== playlistTrackId)
        : [...current, playlistTrackId];
    });
  }, []);

  return {
    clearSelection,
    selectedPlaylistTrackIds,
    selectedPlaylistTrackIdSet,
    selectedTracks,
    selectionRevision,
    selectionActive,
    toggleSelection,
  };
}
