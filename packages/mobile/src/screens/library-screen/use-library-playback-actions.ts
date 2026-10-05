import { useCallback } from 'react';
import type { PlaybackQueueSourceDescriptor, Track } from '@ton/core';
import { playTracks } from '../../services/playback-bridge';

export function useLibraryPlaybackActions(
  playbackTracks: Track[],
  selectedTracks: Track[],
  clearSelection: () => void,
  queueSource: PlaybackQueueSourceDescriptor,
) {
  const handleTrackPress = useCallback((track: Track, selectionActive: boolean, toggleSelection: (trackId: number) => void) => {
    if (selectionActive) {
      toggleSelection(track.id);
      return;
    }

    const currentIndex = playbackTracks.findIndex((currentTrack) => currentTrack.id === track.id);
    if (currentIndex >= 0) {
      playTracks(playbackTracks, currentIndex, queueSource);
    }
  }, [playbackTracks, queueSource]);

  const handleTrackLongPress = useCallback((track: Track, toggleSelection: (trackId: number) => void) => {
    toggleSelection(track.id);
  }, []);

  const handlePlaySelection = useCallback(() => {
    if (selectedTracks.length === 0) {
      return;
    }

    playTracks(selectedTracks, 0, { kind: 'selection' });
    clearSelection();
  }, [clearSelection, selectedTracks]);

  return {
    handlePlaySelection,
    handleTrackLongPress,
    handleTrackPress,
  };
}
