import { useCallback } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';
import { playTracks } from '../../services/playback-bridge';

export function usePlaylistPlaybackActions(
  tracks: PlaylistTrackEntry[],
  selectedTracks: PlaylistTrackEntry[],
  clearSelection: () => void,
) {
  const handlePlay = useCallback((index: number) => {
    playTracks(tracks, index);
  }, [tracks]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) {
      playTracks(tracks, 0);
    }
  }, [tracks]);

  const handlePlaySelection = useCallback(() => {
    if (selectedTracks.length === 0) {
      return;
    }

    playTracks(selectedTracks, 0);
    clearSelection();
  }, [clearSelection, selectedTracks]);

  const handleTrackPress = useCallback((track: PlaylistTrackEntry, index: number, selectionActive: boolean, toggleSelection: (playlistTrackId: number) => void) => {
    if (selectionActive) {
      toggleSelection(track.playlist_track_id);
      return;
    }

    playTracks(tracks, index);
  }, [tracks]);

  const handleTrackLongPress = useCallback((track: PlaylistTrackEntry, toggleSelection: (playlistTrackId: number) => void) => {
    toggleSelection(track.playlist_track_id);
  }, []);

  return {
    handlePlay,
    handlePlayAll,
    handlePlaySelection,
    handleTrackLongPress,
    handleTrackPress,
  };
}
