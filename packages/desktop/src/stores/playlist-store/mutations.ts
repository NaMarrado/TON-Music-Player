import type { Playlist } from './types';
import type { PlaylistAddTracksRequest, PlaylistAddTracksResult } from '@ton/core';
import { invokeIpc } from './ipc';
import { loadPlaylist, loadPlaylists } from './loaders';
import { usePlaylistStore } from './store';

export async function createPlaylist(
  name: string,
  description?: string,
): Promise<Playlist> {
  const playlist = (await invokeIpc('playlist:create', {
    name,
    description,
  })) as Playlist;
  await loadPlaylists({ force: true });
  return playlist;
}

export async function updatePlaylist(
  id: number,
  data: {
    name?: string;
    description?: string;
    smart_rules?: string;
    cover_path?: string;
  },
): Promise<void> {
  await invokeIpc('playlist:update', id, data);
  await loadPlaylists({ force: true });
  const { currentPlaylist } = usePlaylistStore.getState();
  if (currentPlaylist?.id === id) {
    await loadPlaylist(id);
  }
}

export async function deletePlaylist(id: number): Promise<void> {
  await invokeIpc('playlist:delete', id);
  await loadPlaylists({ force: true });
  const { currentPlaylist } = usePlaylistStore.getState();
  if (currentPlaylist?.id === id) {
    usePlaylistStore.setState({ currentPlaylist: null, currentTracks: [] });
  }
}

export async function addTracksToPlaylist(
  request: PlaylistAddTracksRequest,
): Promise<PlaylistAddTracksResult> {
  const result = await invokeIpc('playlist:add-tracks', request) as PlaylistAddTracksResult;
  if (result.status !== 'added') return result;
  const { currentPlaylist } = usePlaylistStore.getState();
  if (currentPlaylist?.id === request.playlistId) {
    await loadPlaylist(request.playlistId);
  }
  return result;
}

export async function removeTrackFromPlaylist(
  playlistTrackId: number,
): Promise<void> {
  await invokeIpc('playlist:remove-track', playlistTrackId);
  const { currentTracks } = usePlaylistStore.getState();
  usePlaylistStore.setState({
    currentTracks: currentTracks.filter(
      (track) => track.playlist_track_id !== playlistTrackId,
    ),
  });
}

export async function reorderPlaylists(orderedIds: number[]): Promise<void> {
  const { playlists } = usePlaylistStore.getState();
  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const reordered = orderedIds
    .map((id) => byId.get(id))
    .filter(Boolean) as Playlist[];

  usePlaylistStore.setState({ playlists: reordered });
  await invokeIpc('playlist:reorder-list', orderedIds);
}

export async function reorderTracks(
  playlistId: number,
  orderedPtIds: number[],
): Promise<void> {
  await invokeIpc('playlist:reorder', playlistId, orderedPtIds);
}
