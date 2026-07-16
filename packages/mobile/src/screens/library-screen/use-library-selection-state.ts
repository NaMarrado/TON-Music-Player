import { useCallback, useMemo, useState } from 'react';
import type { Track } from '@ton/core';

export function useLibrarySelectionState(displayTracks: Track[]) {
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [playlistPickerTrackIds, setPlaylistPickerTrackIds] = useState<number[] | null>(null);
  const selectedTrackIdSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);

  const selectedTracks = useMemo(
    () => displayTracks.filter((track) => selectedTrackIdSet.has(track.id)),
    [displayTracks, selectedTrackIdSet],
  );

  const selectionActive = selectedTrackIds.length > 0;

  const toggleSelection = useCallback((trackId: number) => {
    setSelectedTrackIds((current) => {
      setSelectionRevision((revision) => revision + 1);
      return current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTrackIds((current) => {
      if (current.length === 0) return current;
      setSelectionRevision((revision) => revision + 1);
      return [];
    });
  }, []);

  return {
    clearSelection,
    playlistPickerTrackIds,
    selectedTrackIds,
    selectedTrackIdSet,
    selectionRevision,
    selectedTracks,
    selectionActive,
    setPlaylistPickerTrackIds,
    toggleSelection,
  };
}
