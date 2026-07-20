import type { CloudLibraryManifestV2 } from '@ton/core';

export type MobileCloudApplyDeltaState = {
  mirror: ReadonlyMap<string, string>;
  localTrackArtworkByHash: ReadonlyMap<string, string | null>;
  localPlaylistCoverByCloudId: ReadonlyMap<string, string | null>;
  failedTrackHashes: ReadonlySet<string>;
};

export function selectMobileCloudApplyDeltaFromState(
  manifest: CloudLibraryManifestV2,
  state: MobileCloudApplyDeltaState,
): CloudLibraryManifestV2 {
  const tracks = manifest.tracks.filter((record) => {
    const hash = record.content_hash_sha256.toLowerCase();
    const hasLocalTrack = state.localTrackArtworkByHash.has(hash);
    const localArtwork = state.localTrackArtworkByHash.get(hash) ?? null;
    if (state.mirror.get(`track:${hash}`) !== JSON.stringify(record)) {
      return true;
    }
    if (record.deleted) return false;
    if (!hasLocalTrack || state.failedTrackHashes.has(hash)) return true;
    return Boolean(record.entry.artwork_hash_sha256 && !localArtwork);
  });
  const changedTrackHashes = new Set(
    tracks.map((record) => record.content_hash_sha256.toLowerCase()),
  );

  const playlists = manifest.playlists.filter((record) => {
    const hasLocalPlaylist = state.localPlaylistCoverByCloudId.has(record.cloud_id);
    const localCover = state.localPlaylistCoverByCloudId.get(record.cloud_id) ?? null;
    if (state.mirror.get(`playlist:${record.cloud_id}`) !== JSON.stringify(record)) {
      return true;
    }
    if (record.deleted) return false;
    if (!hasLocalPlaylist || (record.entry.cover_hash_sha256 && !localCover)) return true;
    return record.entry.track_hashes.some(
      (hash) => changedTrackHashes.has(hash.toLowerCase()),
    );
  });

  return { ...manifest, tracks, playlists };
}

export function hasMobileCloudApplyDelta(manifest: CloudLibraryManifestV2): boolean {
  return manifest.tracks.length > 0 || manifest.playlists.length > 0;
}
