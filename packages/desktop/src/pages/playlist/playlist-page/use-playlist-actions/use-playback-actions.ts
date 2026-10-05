import { useCallback } from 'react';
import type { PlaylistTrackEntry } from '@ton/core';
import type { MutableRefObject } from 'react';
import { playTracks } from '../../../../audio/playback-service';
import { getPlaylistPlaybackIndex } from '../use-playlist-view-state/track-sources';

export function usePlaybackActions(playbackTracksRef: MutableRefObject<PlaylistTrackEntry[]>) {
  const handlePlayAll = useCallback(() => {
    const tracks = playbackTracksRef.current;
    if (tracks.length > 0) {
      playTracks(tracks, 0);
    }
  }, [playbackTracksRef]);

  const handlePlayTrack = useCallback(
    (playlistTrackId: number) => {
      const tracks = playbackTracksRef.current;
      const index = getPlaylistPlaybackIndex(tracks, playlistTrackId);
      if (index >= 0) playTracks(tracks, index);
    },
    [playbackTracksRef],
  );

  return {
    handlePlayAll,
    handlePlayTrack,
  };
}
