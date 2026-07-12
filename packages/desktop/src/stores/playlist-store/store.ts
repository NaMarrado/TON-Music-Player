import { create } from 'zustand';
import type { PlaylistState } from './types';

export const usePlaylistStore = create<PlaylistState>()(() => ({
  playlists: [],
  currentPlaylist: null,
  currentTracks: [],
  isLoading: false,
  hasLoaded: false,
}));
