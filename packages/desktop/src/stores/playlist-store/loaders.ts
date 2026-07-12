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

export async function mergeCompletedTrackIntoPlaylists(
  trackId: number,
  playlistIds: number[],
): Promise<void> {
  const uniqueIds = [...new Set(playlistIds)];
  if (uniqueIds.length === 0) return;
  const memberships = await invokeIpc(
    'playlist:get-track-memberships',
    trackId,
    uniqueIds,
  ) as Array<PlaylistTrackEntry & { playlist_id: number; position: number }>;
  const currentPlaylistId = usePlaylistStore.getState().currentPlaylist?.id;
  if (currentPlaylistId == null || !uniqueIds.includes(currentPlaylistId)) return;
  const incoming = memberships.filter((row) => row.playlist_id === currentPlaylistId);
  if (incoming.length === 0) return;
  const incomingIds = new Set(incoming.map((row) => row.playlist_track_id));
  usePlaylistStore.setState((state) => ({
    currentTracks: [
      ...state.currentTracks.filter((row) => !incomingIds.has(row.playlist_track_id)),
      ...incoming,
    ].sort((left, right) => (
      ((left as PlaylistTrackEntry & { position?: number }).position ?? Number.MAX_SAFE_INTEGER)
      - ((right as PlaylistTrackEntry & { position?: number }).position ?? Number.MAX_SAFE_INTEGER)
    )),
  }));
}
