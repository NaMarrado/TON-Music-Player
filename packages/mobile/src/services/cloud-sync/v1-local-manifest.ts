import type {
  CloudLibraryManifestV1,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudTrackEntry,
} from '@ton/core';
import {
  buildCloudLibraryArtworkObjectKey,
  buildCloudLibraryAudioObjectKey,
  buildCloudPlaylistCoverObjectKey,
  buildCloudRevision,
} from '@ton/core';
import { getAllPlaylists, getAllTracksForTransfer, getPlaylistTracks } from '../db-queries';
import { getMobileCloudDeviceId } from './config';
import { hashCloudArtworkCached } from './hash';
import { contentTypeForExtension, getFileExtension, getFileName } from './media';
import {
  emitProgress,
  ensurePlaylistCloudId,
  ensureTrackContentHash,
  fileExists,
  normalizeDownloadedAt,
  throwIfCancelled,
  type CancelSignal,
  type LocalCloudArtwork,
  type LocalCloudTrack,
  type ProgressCallback,
} from './v1-common';
import { runMobileCloudDbLane } from './db-lane';

export async function buildLocalManifest(
  config: CloudStorageConfig,
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<{ manifest: CloudLibraryManifestV1; localTracks: LocalCloudTrack[]; localArtworks: LocalCloudArtwork[] }> {
  const snapshot = await runMobileCloudDbLane(async (db) => {
    const allTracks = await getAllTracksForTransfer(db);
    const playlists = await getAllPlaylists(db);
    const playlistTracks = new Map<number, Awaited<ReturnType<typeof getPlaylistTracks>>>();
    for (const playlist of playlists) {
      playlistTracks.set(playlist.id, await getPlaylistTracks(playlist.id, db));
    }
    return { allTracks, playlists, playlistTracks };
  });
  const { allTracks, playlists } = snapshot;
  const selectedTrackIds = new Set(allTracks.map((track) => track.id));
  const playlistTrackIds = new Map<number, number[]>();
  for (const playlist of playlists) {
    const tracks = snapshot.playlistTracks.get(playlist.id) ?? [];
    playlistTrackIds.set(playlist.id, tracks.map((track) => track.id));
    tracks.forEach((track) => selectedTrackIds.add(track.id));
  }
  const tracks = allTracks.filter((track) => selectedTrackIds.has(track.id));
  const deviceId = await getMobileCloudDeviceId();
  const now = Date.now();
  const localTracks: LocalCloudTrack[] = [];
  const localArtworks: LocalCloudArtwork[] = [];
  const trackEntries: CloudTrackEntry[] = [];

  const missingHashCount = tracks.reduce(
    (count, track) => count + (track.content_hash_sha256 ? 0 : 1), 0,
  );
  let hashedTracks = 0;
  if (missingHashCount > 0) {
    emitProgress(onProgress, { phase: 'hashing', total: missingHashCount });
  }
  for (let index = 0; index < tracks.length; index += 1) {
    throwIfCancelled(shouldCancel);
    const track = tracks[index];
    const neededHash = !track.content_hash_sha256;
    const contentHash = await ensureTrackContentHash(track);
    if (!contentHash) {
      if (neededHash) {
        hashedTracks += 1;
        emitProgress(onProgress, {
          phase: 'hashing', current: hashedTracks, total: missingHashCount, failed: 1,
        });
      }
      continue;
    }
    const ext = getFileExtension(track.file_path, track.format);
    const objectName = { title: track.title, artist: track.artist, fileName: getFileName(track.file_path) };
    const audioObjectKey = buildCloudLibraryAudioObjectKey(config.prefix, contentHash, ext, objectName);
    let artworkHash: string | null = null;
    let artworkObjectKey: string | null = null;
    let artworkFileName: string | null = null;
    if (track.cover_art_path && await fileExists(track.cover_art_path)) {
      artworkHash = await hashCloudArtworkCached(track.cover_art_path);
      const artworkExt = getFileExtension(track.cover_art_path, null);
      artworkObjectKey = buildCloudLibraryArtworkObjectKey(config.prefix, artworkHash, artworkExt, objectName);
      artworkFileName = getFileName(track.cover_art_path);
      localArtworks.push({
        key: artworkObjectKey, filePath: track.cover_art_path,
        hash: artworkHash, contentType: contentTypeForExtension(artworkExt),
      });
    }
    localTracks.push({
      track, contentHash, audioObjectKey, artworkHash,
      artworkObjectKey, artworkPath: track.cover_art_path,
    });
    trackEntries.push({
      content_hash_sha256: contentHash,
      object_key: audioObjectKey,
      file_name: getFileName(track.file_path),
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
    });
    if (neededHash) {
      hashedTracks += 1;
      emitProgress(onProgress, {
        phase: 'hashing', current: hashedTracks, total: missingHashCount,
      });
    }
  }

  const hashesById = new Map(localTracks.map((entry) => [entry.track.id, entry.contentHash]));
  const playlistEntries: CloudPlaylistEntry[] = [];
  for (const playlist of playlists) {
    throwIfCancelled(shouldCancel);
    const cloudId = await ensurePlaylistCloudId(playlist.id, playlist.cloud_id);
    const trackHashes = (playlistTrackIds.get(playlist.id) ?? [])
      .map((trackId) => hashesById.get(trackId) ?? null)
      .filter((hash): hash is string => Boolean(hash));
    let coverHash: string | null = null;
    let coverObjectKey: string | null = null;
    if (playlist.cover_path && await fileExists(playlist.cover_path)) {
      coverHash = await hashCloudArtworkCached(playlist.cover_path);
      const coverExt = getFileExtension(playlist.cover_path, null);
      coverObjectKey = buildCloudPlaylistCoverObjectKey(
        config.prefix, { name: playlist.name, cloudId }, coverHash, coverExt,
      );
      localArtworks.push({
        key: coverObjectKey, filePath: playlist.cover_path,
        hash: coverHash, contentType: contentTypeForExtension(coverExt),
      });
    }
    playlistEntries.push({
      cloud_id: cloudId, name: playlist.name, description: playlist.description,
      cover_hash_sha256: coverHash, cover_object_key: coverObjectKey,
      is_smart: Boolean(playlist.is_smart), smart_rules: playlist.smart_rules,
      sort_order: playlist.sort_order, created_at: playlist.created_at,
      updated_at: playlist.updated_at, track_hashes: trackHashes,
    });
  }
  const revision = buildCloudRevision(deviceId, now);
  return {
    manifest: {
      schema_version: 1, app: 'TON', created_at: now, updated_at: now,
      device_id: deviceId, revision,
      library_track_hashes: [...new Set(localTracks.map((entry) => entry.contentHash))],
      tracks: trackEntries, playlists: playlistEntries,
    },
    localTracks,
    localArtworks,
  };
}
