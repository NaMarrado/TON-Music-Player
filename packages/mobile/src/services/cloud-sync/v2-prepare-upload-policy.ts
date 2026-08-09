export type LocalCloudIdentitySnapshot = {
  tracks: ReadonlyArray<{ id: number; content_hash_sha256: string | null }>;
  playlists: ReadonlyArray<{ id: number; cloud_id: string | null }>;
};

export function selectMissingLocalEntityIds(
  snapshot: LocalCloudIdentitySnapshot,
  remoteTrackHashes: ReadonlySet<string>,
  remotePlaylistIds: ReadonlySet<string>,
): {
  trackIds: number[];
  unhashedTrackIds: number[];
  playlistIds: number[];
} {
  const trackIds: number[] = [];
  const unhashedTrackIds: number[] = [];
  for (const track of snapshot.tracks) {
    if (!track.content_hash_sha256) {
      unhashedTrackIds.push(track.id);
    } else if (!remoteTrackHashes.has(track.content_hash_sha256.toLowerCase())) {
      trackIds.push(track.id);
    }
  }
  return {
    trackIds,
    unhashedTrackIds,
    playlistIds: snapshot.playlists
      .filter((playlist) => !playlist.cloud_id || !remotePlaylistIds.has(playlist.cloud_id))
      .map((playlist) => playlist.id),
  };
}
