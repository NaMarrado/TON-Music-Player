import type { Playlist, PlaylistTrackEntry } from '@ton/core';
import {
  addTracksToPlaylist as dbAddTracks,
  createPlaylist as dbCreatePlaylist,
  deletePlaylist as dbDeletePlaylist,
  removeTrackFromPlaylist as dbRemoveTrack,
  reorderPlaylistTracks as dbReorderTracks,
  updatePlaylist as dbUpdatePlaylist,
} from '../services/db-queries';
import { loadPlaylist } from './playlist-store-load';
import {
  getPlaylistDetail,
  updatePlaylistDetail,
  usePlaylistStore,
} from './playlist-store-state';

export async function createPlaylist(name: string, description?: string): Promise<Playlist> {
  const playlist = await dbCreatePlaylist(name, description);
  usePlaylistStore.setState((state) => ({ playlists: [...state.playlists, playlist] }));
  return playlist;
}

export async function updatePlaylist(
  id: number,
  fields: Partial<Pick<Playlist, 'name' | 'description' | 'cover_path'>>,
): Promise<void> {
  await dbUpdatePlaylist(id, fields);
  usePlaylistStore.setState((state) => {
    const detail = state.playlistDetails[id];
    return {
      playlists: state.playlists.map((playlist) => (
        playlist.id === id ? { ...playlist, ...fields } : playlist
      )),
      playlistDetails: detail ? {
        ...state.playlistDetails,
        [id]: {
          ...detail,
          playlist: detail.playlist ? { ...detail.playlist, ...fields } : null,
        },
      } : state.playlistDetails,
    };
  });
}

export async function deletePlaylist(id: number): Promise<void> {
  await dbDeletePlaylist(id);
  usePlaylistStore.setState((state) => {
    const playlistDetails = { ...state.playlistDetails };
    delete playlistDetails[id];
    return {
      playlists: state.playlists.filter((playlist) => playlist.id !== id),
      playlistDetails,
    };
  });
}

export async function addTracksToPlaylist(playlistId: number, trackIds: number[]): Promise<void> {
  await dbAddTracks(playlistId, trackIds);
  if (usePlaylistStore.getState().playlistDetails[playlistId]) await loadPlaylist(playlistId);
}

export async function removeTrackFromPlaylist(playlistTrackId: number): Promise<void> {
  const removedTrack = await dbRemoveTrack(playlistTrackId);
  if (!removedTrack) return;
  usePlaylistStore.setState((state) => {
    const detail = state.playlistDetails[removedTrack.playlistId];
    if (!detail) return state;
    return {
      playlistDetails: {
        ...state.playlistDetails,
        [removedTrack.playlistId]: {
          ...detail,
          tracks: detail.tracks.filter((track) => track.playlist_track_id !== playlistTrackId),
        },
      },
    };
  });
}

export async function reorderPlaylistTracks(
  playlistId: number,
  orderedPlaylistTrackIds: number[],
): Promise<void> {
  const previousState = usePlaylistStore.getState();
  const previousDetail = getPlaylistDetail(previousState, playlistId);
  const previousPlaylists = previousState.playlists;
  if (!previousDetail.tracks.length) return;
  const trackById = new Map(previousDetail.tracks.map((track) => [track.playlist_track_id, track]));
  const reorderedTracks = orderedPlaylistTrackIds
    .map((id) => trackById.get(id) ?? null)
    .filter((track): track is PlaylistTrackEntry => Boolean(track));
  if (reorderedTracks.length !== previousDetail.tracks.length) {
    await loadPlaylist(playlistId);
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  usePlaylistStore.setState((state) => updatePlaylistDetail(state, playlistId, (detail) => ({
    ...detail,
    playlist: detail.playlist ? { ...detail.playlist, updated_at: now } : null,
    tracks: reorderedTracks,
  })));
  usePlaylistStore.setState((state) => ({
    playlists: state.playlists.map((playlist) => (
      playlist.id === playlistId ? { ...playlist, updated_at: now } : playlist
    )),
  }));
  try {
    await dbReorderTracks(playlistId, orderedPlaylistTrackIds);
  } catch (error) {
    usePlaylistStore.setState((state) => updatePlaylistDetail(
      state, playlistId, () => previousDetail,
    ));
    usePlaylistStore.setState({ playlists: previousPlaylists });
    throw error;
  }
}
