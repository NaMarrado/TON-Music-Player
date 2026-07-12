import { useCallback, useMemo, useState } from 'react';
import type { Track } from '@ton/core';

export function useLibrarySelectionState(displayTracks: Track[]) {
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [playlistPickerTrackIds, setPlaylistPickerTrackIds] = useState<number[] | null>(null);
  const selectedTrackIdSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);

  const selectedTracks = useMemo(
    () => displayTracks.filter((track) => selectedTrackIdSet.has(track.id)),
    [displayTracks, selectedTrackIdSet],
  );

  const selectionActive = selectedTrackIds.length > 0;

  const toggleSelection = useCallback((trackId: number) => {
    setSelectedTrackIds((current) => (
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId]
    ));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTrackIds([]);
  }, []);

  return {
    clearSelection,
    playlistPickerTrackIds,
    selectedTrackIds,
    selectedTrackIdSet,
    selectedTracks,
    selectionActive,
    setPlaylistPickerTrackIds,
    toggleSelection,
  };
}
