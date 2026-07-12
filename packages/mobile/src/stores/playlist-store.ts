import { create } from 'zustand';
import type { Playlist, PlaylistTrackEntry } from '@ton/core';
import {
  getAllPlaylists,
  getPlaylistById,
  getPlaylistTracks,
  getPlaylistMembershipsForTrack,
  createPlaylist as dbCreatePlaylist,
  updatePlaylist as dbUpdatePlaylist,
  deletePlaylist as dbDeletePlaylist,
  addTracksToPlaylist as dbAddTracks,
  removeTrackFromPlaylist as dbRemoveTrack,
  reorderPlaylistTracks as dbReorderTracks,
} from '../services/db-queries';

export interface PlaylistDetailState {
  playlist: Playlist | null;
  tracks: PlaylistTrackEntry[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: 'load-failed' | null;
  requestId: number;
}

interface PlaylistState {
  playlists: Playlist[];
  playlistDetails: Record<number, PlaylistDetailState>;
  isLoading: boolean;
  hasLoaded: boolean;
}

export const EMPTY_PLAYLIST_DETAIL: PlaylistDetailState = Object.freeze({
  playlist: null,
  tracks: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  requestId: 0,
});

function getPlaylistDetail(
  state: PlaylistState,
  playlistId: number,
): PlaylistDetailState {
  return state.playlistDetails[playlistId] ?? EMPTY_PLAYLIST_DETAIL;
}

function updatePlaylistDetail(
  state: PlaylistState,
  playlistId: number,
  updater: (detail: PlaylistDetailState) => PlaylistDetailState,
): PlaylistState | Partial<PlaylistState> {
  const currentDetail = getPlaylistDetail(state, playlistId);
  const nextDetail = updater(currentDetail);
  if (nextDetail === currentDetail) {
    return state;
  }

  return {
    playlistDetails: {
      ...state.playlistDetails,
      [playlistId]: nextDetail,
    },
  };
}

export const usePlaylistStore = create<PlaylistState>()(() => ({
  playlists: [],
  playlistDetails: {},
  isLoading: false,
  hasLoaded: false,
}));

let loadPlaylistsPromise: Promise<void> | null = null;

export async function loadPlaylists(): Promise<void> {
  if (loadPlaylistsPromise) {
    return loadPlaylistsPromise;
  }

  usePlaylistStore.setState({ isLoading: true });
  loadPlaylistsPromise = (async () => {
    try {
      const playlists = await getAllPlaylists();
      usePlaylistStore.setState({ playlists, isLoading: false, hasLoaded: true });
    } catch {
      usePlaylistStore.setState({ isLoading: false });
      throw new Error('playlist-load-failed');
    } finally {
      loadPlaylistsPromise = null;
    }
  })();

  return loadPlaylistsPromise;
}

export async function loadPlaylist(id: number): Promise<void> {
  const currentDetail = getPlaylistDetail(usePlaylistStore.getState(), id);
  const requestId = currentDetail.requestId + 1;

  usePlaylistStore.setState((state) => updatePlaylistDetail(
    state,
    id,
    (detail) => ({
      ...detail,
      error: null,
      isLoading: true,
      requestId,
    }),
  ));

  try {
    const [playlist, tracks] = await Promise.all([
      getPlaylistById(id),
      getPlaylistTracks(id),
    ]);

    usePlaylistStore.setState((state) => {
      const detail = getPlaylistDetail(state, id);
      if (detail.requestId !== requestId) {
        return state;
      }

      return {
        playlistDetails: {
          ...state.playlistDetails,
          [id]: {
            ...detail,
            playlist,
            tracks,
            error: null,
            isLoading: false,
            hasLoaded: true,
          },
        },
      };
    });
  } catch {
    usePlaylistStore.setState((state) => {
      const detail = getPlaylistDetail(state, id);
      if (detail.requestId !== requestId) {
        return state;
      }

      return {
        playlistDetails: {
          ...state.playlistDetails,
          [id]: {
            ...detail,
            error: 'load-failed',
            hasLoaded: detail.hasLoaded ? detail.hasLoaded : true,
            isLoading: false,
          },
        },
      };
    });
  }
}

export async function refreshPlaylistsById(ids: number[]): Promise<void> {
  const playlistIds = [...new Set(ids)];
  if (playlistIds.length === 0) {
    return;
  }

  const refreshed = (await Promise.all(playlistIds.map((id) => getPlaylistById(id))))
    .filter((playlist): playlist is Playlist => playlist != null);
  if (refreshed.length === 0) {
    return;
  }

  usePlaylistStore.setState((state) => {
    const refreshedById = new Map(refreshed.map((playlist) => [playlist.id, playlist]));
    const knownIds = new Set(state.playlists.map((playlist) => playlist.id));
    const playlists = state.playlists.map((playlist) => (
      refreshedById.get(playlist.id) ?? playlist
    ));
    for (const playlist of refreshed) {
      if (!knownIds.has(playlist.id)) {
        playlists.push(playlist);
      }
    }
    playlists.sort((left, right) => (
      left.sort_order - right.sort_order || right.created_at - left.created_at
    ));
    return { playlists };
  });

  const loadedDetails = usePlaylistStore.getState().playlistDetails;
  await Promise.all(playlistIds
    .filter((id) => loadedDetails[id]?.hasLoaded)
    .map((id) => loadPlaylist(id)));
}

export async function mergeCompletedTrackIntoPlaylists(
  trackId: number,
  ids: number[],
): Promise<void> {
  const playlistIds = [...new Set(ids)];
  if (playlistIds.length === 0) return;
  const [memberships, refreshed] = await Promise.all([
    getPlaylistMembershipsForTrack(trackId, playlistIds),
    Promise.all(playlistIds.map((id) => getPlaylistById(id))),
  ]);
  const membershipsByPlaylist = new Map<number, typeof memberships>();
  for (const membership of memberships) {
    const rows = membershipsByPlaylist.get(membership.playlist_id) ?? [];
    rows.push(membership);
    membershipsByPlaylist.set(membership.playlist_id, rows);
  }

  usePlaylistStore.setState((state) => {
    const refreshedById = new Map(
      refreshed.filter((playlist): playlist is Playlist => playlist != null)
        .map((playlist) => [playlist.id, playlist]),
    );
    const playlistDetails = { ...state.playlistDetails };
    for (const playlistId of playlistIds) {
      const detail = playlistDetails[playlistId];
      if (!detail?.hasLoaded) continue;
      const incoming = membershipsByPlaylist.get(playlistId) ?? [];
      const incomingIds = new Set(incoming.map((track) => track.playlist_track_id));
      const tracks = [...detail.tracks.filter(
        (track) => !incomingIds.has(track.playlist_track_id),
      ), ...incoming].sort((left, right) => (
        ((left as PlaylistTrackEntry & { position?: number }).position ?? Number.MAX_SAFE_INTEGER)
        - ((right as PlaylistTrackEntry & { position?: number }).position ?? Number.MAX_SAFE_INTEGER)
      ));
      playlistDetails[playlistId] = {
        ...detail,
        playlist: refreshedById.get(playlistId) ?? detail.playlist,
        tracks,
      };
    }
    return {
      playlists: state.playlists.map((playlist) => refreshedById.get(playlist.id) ?? playlist),
      playlistDetails,
    };
  });
}

export async function createPlaylist(
  name: string,
  description?: string,
): Promise<Playlist> {
  const playlist = await dbCreatePlaylist(name, description);
  const { playlists } = usePlaylistStore.getState();
  usePlaylistStore.setState({ playlists: [...playlists, playlist] });
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
          playlist: detail.playlist ? { ...detail.playlist, ...fields } : detail.playlist,
        },
      } : state.playlistDetails,
    };
  });
}

export async function deletePlaylist(id: number): Promise<void> {
  await dbDeletePlaylist(id);
  usePlaylistStore.setState((state) => {
    const nextDetails = { ...state.playlistDetails };
    delete nextDetails[id];

    return {
      playlists: state.playlists.filter((playlist) => playlist.id !== id),
      playlistDetails: nextDetails,
    };
  });
}

export async function addTracksToPlaylist(
  playlistId: number,
  trackIds: number[],
): Promise<void> {
  await dbAddTracks(playlistId, trackIds);
  if (usePlaylistStore.getState().playlistDetails[playlistId]) {
    await loadPlaylist(playlistId);
  }
}

export async function removeTrackFromPlaylist(
  playlistTrackId: number,
): Promise<void> {
  const removedTrack = await dbRemoveTrack(playlistTrackId);
  if (!removedTrack) {
    return;
  }

  usePlaylistStore.setState((state) => {
    const detail = state.playlistDetails[removedTrack.playlistId];
    if (!detail) {
      return state;
    }

    return {
      playlistDetails: {
        ...state.playlistDetails,
        [removedTrack.playlistId]: {
          ...detail,
          tracks: detail.tracks.filter(
            (track) => track.playlist_track_id !== playlistTrackId,
          ),
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
  if (!previousDetail.tracks.length) {
    return;
  }

  const trackByPlaylistTrackId = new Map(
    previousDetail.tracks.map((track) => [track.playlist_track_id, track]),
  );
  const reorderedTracks = orderedPlaylistTrackIds
    .map((playlistTrackId) => trackByPlaylistTrackId.get(playlistTrackId) ?? null)
    .filter((track): track is PlaylistTrackEntry => Boolean(track));

  if (reorderedTracks.length !== previousDetail.tracks.length) {
    await loadPlaylist(playlistId);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  usePlaylistStore.setState((state) => updatePlaylistDetail(
    state,
    playlistId,
    (detail) => ({
      ...detail,
      playlist: detail.playlist ? { ...detail.playlist, updated_at: now } : detail.playlist,
      tracks: reorderedTracks,
    }),
  ));
  usePlaylistStore.setState((state) => ({
    playlists: state.playlists.map((playlist) => (
      playlist.id === playlistId ? { ...playlist, updated_at: now } : playlist
    )),
  }));

  try {
    await dbReorderTracks(playlistId, orderedPlaylistTrackIds);
  } catch (error) {
    usePlaylistStore.setState((state) => updatePlaylistDetail(
      state,
      playlistId,
      () => previousDetail,
    ));
    usePlaylistStore.setState({ playlists: previousPlaylists });
    throw error;
  }
}
