import { useCallback } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';
import type { MutableRefObject } from 'react';
import { playTracks } from '../../../../audio/playback-service';

export function usePlaybackActions(displayTracksRef: MutableRefObject<PlaylistTrackEntry[]>) {
  const handlePlayAll = useCallback(() => {
    const tracks = displayTracksRef.current;
    if (tracks.length > 0) {
      playTracks(tracks, 0);
    }
  }, [displayTracksRef]);

  const handlePlayTrack = useCallback(
    (index: number) => {
      playTracks(displayTracksRef.current, index);
    },
    [displayTracksRef],
  );

  return {
    handlePlayAll,
    handlePlayTrack,
  };
}
