import type { CloudLibraryManifestV1, CloudPlaylistEntry, CloudStorageConfig, CloudTrackEntry } from '@ton/core';
import {
  buildCloudContentArtworkObjectKey,
  buildCloudContentAudioObjectKey,
  convertCloudLibraryManifestV1ToV2,
} from '@ton/core';
import { buildLocalManifest } from './v1-local-manifest';
import { contentTypeForExtension, getFileExtension } from './media';
import type { MobileCloudV2SyncOptions, PreparedLocalManifest } from './v2-common';
import { runMobileCloudDbLane } from './db-lane';

export async function prepareLocalManifest(
  config: CloudStorageConfig,
  deviceId: string,
  onProgress?: MobileCloudV2SyncOptions['onProgress'],
  signal?: AbortSignal,
): Promise<PreparedLocalManifest> {
  const built = await buildLocalManifest(config, onProgress, () => Boolean(signal?.aborted));
  const audioKeys = new Map<string, string>();
  const artworkKeys = new Map<string, string>();
  const uploads: PreparedLocalManifest['uploads'] = new Map();
  for (const local of built.localTracks) {
    const ext = getFileExtension(local.track.file_path, local.track.format);
    const key = buildCloudContentAudioObjectKey(config.prefix, local.contentHash, ext);
    audioKeys.set(local.contentHash, key);
    uploads.set(key, {
      filePath: local.track.file_path,
      contentType: contentTypeForExtension(ext),
      hash: local.contentHash,
      progressGroup: local.contentHash,
    });
  }
  const artworkProgressGroups = new Map(
    built.localTracks
      .filter((local) => local.artworkHash)
      .map((local) => [local.artworkHash as string, local.contentHash]),
  );
  for (const artwork of built.localArtworks) {
    const ext = getFileExtension(artwork.filePath, null);
    const key = buildCloudContentArtworkObjectKey(config.prefix, artwork.hash, ext);
    artworkKeys.set(artwork.hash, key);
    uploads.set(key, {
      filePath: artwork.filePath,
      contentType: artwork.contentType,
      hash: artwork.hash,
      progressGroup: artworkProgressGroups.get(artwork.hash) ?? null,
    });
  }
  const tracks = built.manifest.tracks.map((entry) => ({
    ...entry,
    object_key: audioKeys.get(entry.content_hash_sha256) ?? entry.object_key,
    artwork_object_key: entry.artwork_hash_sha256
      ? artworkKeys.get(entry.artwork_hash_sha256) ?? entry.artwork_object_key
      : null,
  }));
  const playlists = built.manifest.playlists.map((entry) => ({
    ...entry,
    cover_object_key: entry.cover_hash_sha256
      ? artworkKeys.get(entry.cover_hash_sha256) ?? entry.cover_object_key
      : null,
  }));
  const rewrittenV1: CloudLibraryManifestV1 = { ...built.manifest, tracks, playlists };
  const manifest = convertCloudLibraryManifestV1ToV2(rewrittenV1);
  manifest.writer_device_id = deviceId;
  const entriesByHash = new Map(tracks.map((entry) => [entry.content_hash_sha256, entry]));
  const trackEntryByLocalId = new Map<number, CloudTrackEntry>();
  for (const local of built.localTracks) {
    const entry = entriesByHash.get(local.contentHash);
    if (entry) trackEntryByLocalId.set(local.track.id, entry);
  }
  const rows = await runMobileCloudDbLane((db) => db.getAllAsync<{ id: number; cloud_id: string }>(
    `SELECT id, cloud_id FROM playlists WHERE cloud_id IS NOT NULL AND cloud_id != ''`,
  ));
  const entriesByCloudId = new Map(playlists.map((entry) => [entry.cloud_id, entry]));
  const playlistEntryByLocalId = new Map<number, CloudPlaylistEntry>();
  for (const row of rows) {
    const entry = entriesByCloudId.get(row.cloud_id);
    if (entry) playlistEntryByLocalId.set(row.id, entry);
  }
  return { manifest, uploads, trackEntryByLocalId, playlistEntryByLocalId, incremental: false };
}
