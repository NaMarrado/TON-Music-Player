import type { PlaylistTrackEntry, Track } from '@ton/core';
import { usePlaybackStore } from '../../stores/playback-store';
import { upsertTrack } from '../../stores/library-store';
import { usePlaylistStore } from '../../stores/playlist-store';
import { getTrackById } from '../db-queries';

export async function syncAnalyzedTrackById(trackId: number): Promise<{
  track: Track | null;
  updatedCurrentTrack: boolean;
}> {
  const track = await getTrackById(trackId);
  if (!track) {
    return { track: null, updatedCurrentTrack: false };
  }

  upsertTrack(track);

  usePlaylistStore.setState((state) => {
    let changed = false;
    const nextDetails = Object.fromEntries(
      Object.entries(state.playlistDetails).map(([playlistId, detail]) => {
        let detailChanged = false;
        const nextTracks = detail.tracks.map((playlistTrack) => {
          if (playlistTrack.id !== track.id) {
            return playlistTrack;
          }

          detailChanged = true;
          changed = true;
          return {
            ...track,
            playlist_track_id: playlistTrack.playlist_track_id,
          } satisfies PlaylistTrackEntry;
        });

        if (!detailChanged) {
          return [playlistId, detail];
        }

        return [playlistId, { ...detail, tracks: nextTracks }];
      }),
    );

    return changed ? { playlistDetails: nextDetails } : state;
  });

  const currentTrack = usePlaybackStore.getState().currentTrack;
  if (currentTrack?.id !== track.id) {
    return { track, updatedCurrentTrack: false };
  }

  usePlaybackStore.setState({ currentTrack: track });
  return { track, updatedCurrentTrack: true };
}
