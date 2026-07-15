import type { Playlist, PlaylistTrackEntry } from '@ton/core';
import { getPlaylistById, getPlaylistMembershipsForTrack } from '../services/db-queries';
import { usePlaylistStore } from './playlist-store-state';

export async function mergeCompletedTrackIntoPlaylists(
  trackId: number,
  ids: number[],
): Promise<void> {
  const playlistIds = [...new Set(ids)];
  if (playlistIds.length === 0) return;
  const [memberships, refreshed] = await Promise.all([
    getPlaylistMembershipsForTrack(trackId, playlistIds),
    Promise.all(playlistIds.map(getPlaylistById)),
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
