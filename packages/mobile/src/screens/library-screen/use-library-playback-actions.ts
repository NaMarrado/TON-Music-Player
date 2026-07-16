import { useCallback } from 'react';
import type { Track } from '@ton/core';
import { playTracks } from '../../services/playback-bridge';

export function useLibraryPlaybackActions(
  displayTracks: Track[],
  selectedTracks: Track[],
  clearSelection: () => void,
) {
  const handleTrackPress = useCallback((track: Track, selectionActive: boolean, toggleSelection: (trackId: number) => void) => {
    if (selectionActive) {
      toggleSelection(track.id);
      return;
    }

    const currentIndex = displayTracks.findIndex((currentTrack) => currentTrack.id === track.id);
    if (currentIndex >= 0) {
      playTracks(displayTracks, currentIndex);
    }
  }, [displayTracks]);

  const handleTrackLongPress = useCallback((track: Track, toggleSelection: (trackId: number) => void) => {
    toggleSelection(track.id);
  }, []);

  const handlePlaySelection = useCallback(() => {
    if (selectedTracks.length === 0) {
      return;
    }

    playTracks(selectedTracks, 0);
    clearSelection();
  }, [clearSelection, selectedTracks]);

  const handlePlay = useCallback((index: number) => {
    playTracks(displayTracks, index);
  }, [displayTracks]);

  const handlePlayAll = useCallback(() => {
    if (displayTracks.length > 0) {
      playTracks(displayTracks, 0);
    }
  }, [displayTracks]);

  return {
    handlePlay,
    handlePlayAll,
    handlePlaySelection,
    handleTrackLongPress,
    handleTrackPress,
  };
}
