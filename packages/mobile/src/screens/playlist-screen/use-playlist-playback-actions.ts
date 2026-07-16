import { useCallback } from 'react';
import type { PlaybackQueueSourceDescriptor, PlaylistTrackEntry } from '@ton/core';
import { playTracks } from '../../services/playback-bridge';

export function usePlaylistPlaybackActions(
  playlistId: number,
  tracks: PlaylistTrackEntry[],
  selectedTracks: PlaylistTrackEntry[],
  clearSelection: () => void,
  queueSource: PlaybackQueueSourceDescriptor,
) {
  const handlePlay = useCallback((index: number) => {
    playTracks(tracks, index, queueSource);
  }, [queueSource, tracks]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) {
      playTracks(tracks, 0, queueSource);
    }
  }, [queueSource, tracks]);

  const handlePlaySelection = useCallback(() => {
    if (selectedTracks.length === 0) {
      return;
    }

    playTracks(selectedTracks, 0, { kind: 'selection', source_id: playlistId });
    clearSelection();
  }, [clearSelection, selectedTracks]);

  const handleTrackPress = useCallback((track: PlaylistTrackEntry, index: number, selectionActive: boolean, toggleSelection: (playlistTrackId: number) => void) => {
    if (selectionActive) {
      toggleSelection(track.playlist_track_id);
      return;
    }

    playTracks(tracks, index, queueSource);
  }, [queueSource, tracks]);

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
