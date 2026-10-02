import { useCallback } from 'react';
import { playTracks } from '../../../../audio/playback-service';
import type { LibraryPageActionsArgs } from './types';
import { getLibraryPlaybackIndex } from '../track-sources';

type UseLibraryPlaybackActionsArgs = Pick<LibraryPageActionsArgs, 'playbackTracksRef'>;

export function useLibraryPlaybackActions({
  playbackTracksRef,
}: UseLibraryPlaybackActionsArgs) {
  const handlePlayAll = useCallback(() => {
    const currentTracks = playbackTracksRef.current;
    if (currentTracks.length > 0) {
      playTracks(currentTracks, 0);
    }
  }, [playbackTracksRef]);

  const handlePlayTrack = useCallback(
    (trackId: number) => {
      const currentTracks = playbackTracksRef.current;
      const currentIndex = getLibraryPlaybackIndex(currentTracks, trackId);
      if (currentIndex >= 0) {
        playTracks(currentTracks, currentIndex);
      }
    },
    [playbackTracksRef],
  );

  return {
    handlePlayAll,
    handlePlayTrack,
  };
}
