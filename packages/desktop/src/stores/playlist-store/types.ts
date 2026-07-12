import type {
  Playlist,
  PlaylistTrackEntry,
  SmartPlaylistConfig,
} from '@ton/core';

export type { Playlist } from '@ton/core';
export type { PlaylistTrackEntry } from '@ton/core';

export interface PlaylistState {
  playlists: Playlist[];
  currentPlaylist: Playlist | null;
  currentTracks: PlaylistTrackEntry[];
  isLoading: boolean;
  hasLoaded: boolean;
}

export interface PlaylistFetchResult {
  playlist: Playlist;
  tracks: PlaylistTrackEntry[];
}

export interface ImportFolderEmpty {
  empty: true;
}

export type ImportFolderResult = Playlist | ImportFolderEmpty | null;

export interface DuplicateCheck {
  total: number;
  existing: number;
}

export interface PlaylistLibraryStatus {
  total: number;
  alreadyInLibrary: number;
  newTracks: number;
}

export interface PlaylistLibraryAddResult {
  added: number;
  skipped: number;
}

export type PlaylistSmartConfig = SmartPlaylistConfig;
