import { create } from 'zustand';
import type { Playlist, PlaylistTrackEntry } from '@ton/core';

export interface PlaylistDetailState {
  playlist: Playlist | null;
  tracks: PlaylistTrackEntry[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: 'load-failed' | null;
  requestId: number;
}

export interface PlaylistState {
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

export function getPlaylistDetail(state: PlaylistState, playlistId: number): PlaylistDetailState {
  return state.playlistDetails[playlistId] ?? EMPTY_PLAYLIST_DETAIL;
}

export function updatePlaylistDetail(
  state: PlaylistState,
  playlistId: number,
  updater: (detail: PlaylistDetailState) => PlaylistDetailState,
): PlaylistState | Partial<PlaylistState> {
  const currentDetail = getPlaylistDetail(state, playlistId);
  const nextDetail = updater(currentDetail);
  if (nextDetail === currentDetail) return state;
  return {
    playlistDetails: { ...state.playlistDetails, [playlistId]: nextDetail },
  };
}

export const usePlaylistStore = create<PlaylistState>()(() => ({
  playlists: [],
  playlistDetails: {},
  isLoading: false,
  hasLoaded: false,
}));
