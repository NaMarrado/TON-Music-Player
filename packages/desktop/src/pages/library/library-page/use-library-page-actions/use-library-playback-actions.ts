import { useCallback } from 'react';
import { playTracks } from '../../../../audio/playback-service';
import type { LibraryPageActionsArgs } from './types';

type UseLibraryPlaybackActionsArgs = Pick<LibraryPageActionsArgs, 'filteredTracksRef'>;

export function useLibraryPlaybackActions({
  filteredTracksRef,
}: UseLibraryPlaybackActionsArgs) {
  const handlePlayAll = useCallback(() => {
    const currentTracks = filteredTracksRef.current;
    if (currentTracks.length > 0) {
      playTracks(currentTracks, 0);
    }
  }, [filteredTracksRef]);

  const handlePlayTrack = useCallback(
    (trackId: number) => {
      const currentTracks = filteredTracksRef.current;
      const currentIndex = currentTracks.findIndex((track) => track.id === trackId);
      if (currentIndex >= 0) {
        playTracks(currentTracks, currentIndex);
      }
    },
    [filteredTracksRef],
  );

  return {
    handlePlayAll,
    handlePlayTrack,
  };
}
