import type {
  Playlist,
  PlaylistFetchResult,
  PlaylistTrackEntry,
  PlaylistSmartConfig,
} from './types';
import { invokeIpc } from './ipc';
import { usePlaylistStore } from './store';

let loadPlaylistsPromise: Promise<void> | null = null;

export async function loadPlaylists(options: { force?: boolean } = {}): Promise<void> {
  const { force = false } = options;
  const state = usePlaylistStore.getState();
  if (!force && state.hasLoaded) {
    return;
  }

  if (loadPlaylistsPromise) {
    return loadPlaylistsPromise;
  }

  // This refresh feeds the sidebar; page loading belongs exclusively to loadPlaylist().
  loadPlaylistsPromise = (async () => {
    try {
      const playlists = (await invokeIpc('playlist:list')) as Playlist[];
      usePlaylistStore.setState({ playlists, hasLoaded: true });
    } catch {
      throw new Error('playlist-load-failed');
    }
  })();

  try {
    await loadPlaylistsPromise;
  } finally {
    loadPlaylistsPromise = null;
  }
}

export async function loadPlaylist(id: number): Promise<void> {
  const { currentPlaylist } = usePlaylistStore.getState();
  if (!currentPlaylist || currentPlaylist.id !== id) {
    usePlaylistStore.setState({ isLoading: true });
  }

  try {
    const result = (await invokeIpc('playlist:get', id)) as PlaylistFetchResult | null;
    if (result) {
      usePlaylistStore.setState({
        currentPlaylist: result.playlist,
        currentTracks: result.tracks,
        isLoading: false,
        hasLoaded: true,
      });
      return;
    }

    usePlaylistStore.setState({
      currentPlaylist: null,
      currentTracks: [],
      isLoading: false,
      hasLoaded: true,
    });
  } catch {
    usePlaylistStore.setState({ isLoading: false });
  }
}

export async function loadSmartPlaylistTracks(
  config: PlaylistSmartConfig,
): Promise<PlaylistTrackEntry[]> {
  return (await invokeIpc('playlist:smart-query', config)) as PlaylistTrackEntry[];
}
