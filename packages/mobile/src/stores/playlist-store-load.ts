import type { Playlist } from '@ton/core';
import { getAllPlaylists, getPlaylistById, getPlaylistTracks } from '../services/db-queries';
import {
  getPlaylistDetail,
  updatePlaylistDetail,
  usePlaylistStore,
} from './playlist-store-state';

let loadPlaylistsPromise: Promise<void> | null = null;

export async function loadPlaylists(): Promise<void> {
  if (loadPlaylistsPromise) return loadPlaylistsPromise;
  usePlaylistStore.setState({ isLoading: true });
  loadPlaylistsPromise = getAllPlaylists()
    .then((playlists) => usePlaylistStore.setState({ playlists, isLoading: false, hasLoaded: true }))
    .catch(() => {
      usePlaylistStore.setState({ isLoading: false });
      throw new Error('playlist-load-failed');
    })
    .finally(() => { loadPlaylistsPromise = null; });
  return loadPlaylistsPromise;
}

export async function loadPlaylist(id: number): Promise<void> {
  const requestId = getPlaylistDetail(usePlaylistStore.getState(), id).requestId + 1;
  usePlaylistStore.setState((state) => updatePlaylistDetail(state, id, (detail) => ({
    ...detail, error: null, isLoading: true, requestId,
  })));
  try {
    const [playlist, tracks] = await Promise.all([getPlaylistById(id), getPlaylistTracks(id)]);
    usePlaylistStore.setState((state) => {
      const detail = getPlaylistDetail(state, id);
      if (detail.requestId !== requestId) return state;
      return {
        playlistDetails: {
          ...state.playlistDetails,
          [id]: { ...detail, playlist, tracks, error: null, isLoading: false, hasLoaded: true },
        },
      };
    });
  } catch {
    usePlaylistStore.setState((state) => {
      const detail = getPlaylistDetail(state, id);
      if (detail.requestId !== requestId) return state;
      return {
        playlistDetails: {
          ...state.playlistDetails,
          [id]: { ...detail, error: 'load-failed', hasLoaded: true, isLoading: false },
        },
      };
    });
  }
}

export async function reloadLoadedPlaylistDetails(): Promise<void> {
  const ids = Object.entries(usePlaylistStore.getState().playlistDetails)
    .filter(([, detail]) => detail.hasLoaded)
    .map(([id]) => Number(id))
    .filter(Number.isFinite);
  await Promise.all(ids.map(loadPlaylist));
}

export async function refreshPlaylistsById(ids: number[]): Promise<void> {
  const playlistIds = [...new Set(ids)];
  if (playlistIds.length === 0) return;
  const refreshed = (await Promise.all(playlistIds.map(getPlaylistById)))
    .filter((playlist): playlist is Playlist => playlist != null);
  if (refreshed.length === 0) return;
  usePlaylistStore.setState((state) => {
    const byId = new Map(refreshed.map((playlist) => [playlist.id, playlist]));
    const knownIds = new Set(state.playlists.map((playlist) => playlist.id));
    const playlists = state.playlists.map((playlist) => byId.get(playlist.id) ?? playlist);
    refreshed.forEach((playlist) => { if (!knownIds.has(playlist.id)) playlists.push(playlist); });
    playlists.sort((left, right) => left.sort_order - right.sort_order || right.created_at - left.created_at);
    return { playlists };
  });
  const details = usePlaylistStore.getState().playlistDetails;
  await Promise.all(playlistIds.filter((id) => details[id]?.hasLoaded).map(loadPlaylist));
}
