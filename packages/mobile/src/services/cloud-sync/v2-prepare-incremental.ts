import * as FileSystem from 'expo-file-system';
import type { CloudPlaylistEntry, CloudStorageConfig, CloudTrackEntry, Track } from '@ton/core';
import {
  buildCloudContentArtworkObjectKey,
  buildCloudContentAudioObjectKey,
  createEmptyCloudLibraryManifestV2,
} from '@ton/core';
import { getPlaylistById, getPlaylistTracks, getTrackById } from '../db-queries';
import { hashCloudArtworkCached, hashFileSha256 } from './hash';
import { withMobileCloudOutboxSuppressed, type MobileCloudOutboxRow } from './local-state';
import { contentTypeForExtension, getFileExtension } from './media';
import {
  normalizeDownloadedAt,
  throwIfAborted,
  type PreparedLocalManifest,
} from './v2-common';

async function pathExists(path: string | null | undefined): Promise<boolean> {
  return path ? (await FileSystem.getInfoAsync(path)).exists : false;
}

async function serializeIncrementalTrack(
  config: CloudStorageConfig,
  track: Track,
  uploads: PreparedLocalManifest['uploads'],
): Promise<CloudTrackEntry | null> {
  if (!(await pathExists(track.file_path))) return null;
  let contentHash = track.content_hash_sha256;
  if (!contentHash) {
    contentHash = await hashFileSha256(track.file_path);
    await withMobileCloudOutboxSuppressed(async (db) => {
      await db.runAsync(
        'UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?', [contentHash, track.id],
      );
    });
  }
  const ext = getFileExtension(track.file_path, track.format);
  const objectKey = buildCloudContentAudioObjectKey(config.prefix, contentHash, ext);
  uploads.set(objectKey, {
    filePath: track.file_path, contentType: contentTypeForExtension(ext), hash: contentHash,
    progressGroup: contentHash,
  });
  let artworkHash: string | null = null;
  let artworkObjectKey: string | null = null;
  let artworkFileName: string | null = null;
  if (track.cover_art_path && await pathExists(track.cover_art_path)) {
    artworkHash = await hashCloudArtworkCached(track.cover_art_path);
    const artworkExt = getFileExtension(track.cover_art_path, null);
    artworkObjectKey = buildCloudContentArtworkObjectKey(config.prefix, artworkHash, artworkExt);
    artworkFileName = track.cover_art_path.split('/').pop() ?? `${artworkHash}${artworkExt}`;
    uploads.set(artworkObjectKey, {
      filePath: track.cover_art_path,
      contentType: contentTypeForExtension(artworkExt),
      hash: artworkHash,
      progressGroup: contentHash,
    });
  }
  return {
    content_hash_sha256: contentHash,
    object_key: objectKey,
    file_name: track.file_path.split('/').pop() ?? `${contentHash}${ext}`,
    file_size: track.file_size,
    format: track.format,
    artwork_hash_sha256: artworkHash,
    artwork_object_key: artworkObjectKey,
    artwork_file_name: artworkFileName,
    youtube_id: track.youtube_id,
    spotify_id: track.spotify_id,
    soundcloud_id: track.soundcloud_id,
    source_url: track.source_url,
    downloaded_at: normalizeDownloadedAt(track.downloaded_at),
    added_at: track.added_at,
    updated_at: track.scanned_at || track.added_at,
    metadata: {
      title: track.title, artist: track.artist, album: track.album,
      album_artist: track.album_artist, track_number: track.track_number,
      disc_number: track.disc_number, duration_ms: track.duration_ms,
      genre: track.genre, year: track.year, bitrate: track.bitrate,
      sample_rate: track.sample_rate, loudness_lufs: track.loudness_lufs,
      loudness_gain: track.loudness_gain, rating: track.rating,
    },
  };
}

export async function prepareIncrementalManifest(
  config: CloudStorageConfig,
  deviceId: string,
  outbox: readonly MobileCloudOutboxRow[],
  signal?: AbortSignal,
): Promise<PreparedLocalManifest> {
  const uploads: PreparedLocalManifest['uploads'] = new Map();
  const trackEntryByLocalId = new Map<number, CloudTrackEntry>();
  const playlistEntryByLocalId = new Map<number, CloudPlaylistEntry>();
  const trackIds = new Set<number>();
  const playlistIds = new Set<number>();
  for (const row of outbox) {
    if (row.operation !== 'upsert' || row.local_id == null) continue;
    (row.entity_type === 'track' ? trackIds : playlistIds).add(row.local_id);
  }
  const playlistTracksById = new Map<number, Awaited<ReturnType<typeof getPlaylistTracks>>>();
  for (const playlistId of playlistIds) {
    throwIfAborted(signal);
    const tracks = await getPlaylistTracks(playlistId);
    playlistTracksById.set(playlistId, tracks);
    tracks.forEach((track) => trackIds.add(track.id));
  }
  for (const trackId of trackIds) {
    throwIfAborted(signal);
    const track = await getTrackById(trackId);
    if (!track) continue;
    const entry = await serializeIncrementalTrack(config, track, uploads);
    if (entry) trackEntryByLocalId.set(trackId, entry);
  }
  for (const playlistId of playlistIds) {
    throwIfAborted(signal);
    const playlist = await getPlaylistById(playlistId);
    if (!playlist?.cloud_id) continue;
    let coverHash: string | null = null;
    let coverObjectKey: string | null = null;
    if (playlist.cover_path && await pathExists(playlist.cover_path)) {
      coverHash = await hashCloudArtworkCached(playlist.cover_path);
      const ext = getFileExtension(playlist.cover_path, null);
      coverObjectKey = buildCloudContentArtworkObjectKey(config.prefix, coverHash, ext);
      uploads.set(coverObjectKey, {
        filePath: playlist.cover_path,
        contentType: contentTypeForExtension(ext),
        hash: coverHash,
        progressGroup: null,
      });
    }
    const trackHashes = (playlistTracksById.get(playlistId) ?? [])
      .map((track) => track.content_hash_sha256
        ?? trackEntryByLocalId.get(track.id)?.content_hash_sha256
        ?? null)
      .filter((hash): hash is string => Boolean(hash));
    playlistEntryByLocalId.set(playlistId, {
      cloud_id: playlist.cloud_id, name: playlist.name, description: playlist.description,
      cover_hash_sha256: coverHash, cover_object_key: coverObjectKey,
      is_smart: Boolean(playlist.is_smart), smart_rules: playlist.smart_rules,
      sort_order: playlist.sort_order, created_at: playlist.created_at,
      updated_at: playlist.updated_at, track_hashes: trackHashes,
    });
  }
  return {
    manifest: createEmptyCloudLibraryManifestV2(deviceId),
    uploads,
    trackEntryByLocalId,
    playlistEntryByLocalId,
    incremental: true,
  };
}
