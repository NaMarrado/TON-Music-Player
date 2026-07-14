import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CloudLibraryManifestV1,
  CloudPlaylistEntry,
  CloudStorageConfig,
  CloudTrackEntry,
  Playlist,
  Track,
} from '@ton/core';
import {
  buildCloudLibraryArtworkObjectKey,
  buildCloudLibraryAudioObjectKey,
  buildCloudPlaylistCoverObjectKey,
  buildCloudRevision,
} from '@ton/core';
import { getDb } from '../database';
import { hashFileSha256 } from './hash';
import { hashCloudArtworkFile } from './hash-cache';
import { contentTypeForExtension, extensionForTrack } from './media';
import { getDesktopCloudDeviceId } from './config';
import { setDesktopCloudOutboxSuppressed } from './auto-sync-store';
import {
  emitProgress,
  pathExists,
  throwIfCancelled,
  type CancelSignal,
  type LocalCloudArtwork,
  type LocalCloudTrack,
  type ProgressCallback,
} from './sync-common';

export async function ensureTrackContentHash(track: Track): Promise<string | null> {
  if (!(await pathExists(track.file_path))) {
    return null;
  }
  if (track.content_hash_sha256) {
    return track.content_hash_sha256;
  }
  const contentHash = await hashFileSha256(track.file_path);
  setDesktopCloudOutboxSuppressed(() => {
    getDb().prepare('UPDATE tracks SET content_hash_sha256 = ? WHERE id = ?')
      .run(contentHash, track.id);
  });
  track.content_hash_sha256 = contentHash;
  return contentHash;
}

export async function ensurePlaylistCloudId(playlist: Playlist): Promise<string> {
  if (playlist.cloud_id) {
    return playlist.cloud_id;
  }
  const cloudId = `playlist-${randomUUID()}`;
  setDesktopCloudOutboxSuppressed(() => {
    getDb().prepare('UPDATE playlists SET cloud_id = ? WHERE id = ?').run(cloudId, playlist.id);
  });
  playlist.cloud_id = cloudId;
  return cloudId;
}

async function serializeLocalTrack(
  config: CloudStorageConfig,
  track: Track,
  localArtworks: LocalCloudArtwork[],
): Promise<{ local: LocalCloudTrack; entry: CloudTrackEntry } | null> {
  const contentHash = await ensureTrackContentHash(track);
  if (!contentHash) {
    return null;
  }
  const ext = extensionForTrack(track.file_path, track.format);
  const objectName = { title: track.title, artist: track.artist, fileName: path.basename(track.file_path) };
  const audioObjectKey = buildCloudLibraryAudioObjectKey(config.prefix, contentHash, ext, objectName);
  let artworkHash: string | null = null;
  let artworkObjectKey: string | null = null;
  let artworkFileName: string | null = null;
  if (track.cover_art_path && await pathExists(track.cover_art_path)) {
    artworkHash = await hashCloudArtworkFile(track.cover_art_path);
    const artworkExt = path.extname(track.cover_art_path) || '.jpg';
    artworkObjectKey = buildCloudLibraryArtworkObjectKey(config.prefix, artworkHash, artworkExt, objectName);
    artworkFileName = path.basename(track.cover_art_path);
    localArtworks.push({
      key: artworkObjectKey,
      filePath: track.cover_art_path,
      hash: artworkHash,
      contentType: contentTypeForExtension(artworkExt),
    });
  }
  return {
    local: { track, contentHash, audioObjectKey, artworkHash, artworkObjectKey, artworkPath: track.cover_art_path },
    entry: {
      content_hash_sha256: contentHash,
      object_key: audioObjectKey,
      file_name: path.basename(track.file_path),
      file_size: track.file_size,
      format: track.format,
      artwork_hash_sha256: artworkHash,
      artwork_object_key: artworkObjectKey,
      artwork_file_name: artworkFileName,
      youtube_id: track.youtube_id,
      spotify_id: track.spotify_id,
      soundcloud_id: track.soundcloud_id,
      source_url: track.source_url,
      downloaded_at: track.downloaded_at,
      added_at: track.added_at,
      updated_at: track.scanned_at || track.added_at,
      metadata: {
        title: track.title,
        artist: track.artist,
        album: track.album,
        album_artist: track.album_artist,
        track_number: track.track_number,
        disc_number: track.disc_number,
        duration_ms: track.duration_ms,
        genre: track.genre,
        year: track.year,
        bitrate: track.bitrate,
        sample_rate: track.sample_rate,
        loudness_lufs: track.loudness_lufs,
        loudness_gain: track.loudness_gain,
        rating: track.rating,
      },
    },
  };
}

async function serializeLocalPlaylist(
  config: CloudStorageConfig,
  playlist: Playlist,
  contentHashByTrackId: Map<number, string>,
  localArtworks: LocalCloudArtwork[],
): Promise<CloudPlaylistEntry> {
  const cloudId = await ensurePlaylistCloudId(playlist);
  const rows = getDb().prepare(`
    SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC
  `).all(playlist.id) as Array<{ track_id: number }>;
  const trackHashes = rows
    .map((row) => contentHashByTrackId.get(row.track_id) ?? null)
    .filter((hash): hash is string => Boolean(hash));
  let coverHash: string | null = null;
  let coverObjectKey: string | null = null;
  if (playlist.cover_path && await pathExists(playlist.cover_path)) {
    coverHash = await hashCloudArtworkFile(playlist.cover_path);
    const coverExt = path.extname(playlist.cover_path) || '.jpg';
    coverObjectKey = buildCloudPlaylistCoverObjectKey(
      config.prefix,
      { name: playlist.name, cloudId },
      coverHash,
      coverExt,
    );
    localArtworks.push({
      key: coverObjectKey,
      filePath: playlist.cover_path,
      hash: coverHash,
      contentType: contentTypeForExtension(coverExt),
    });
  }
  return {
    cloud_id: cloudId,
    name: playlist.name,
    description: playlist.description,
    cover_hash_sha256: coverHash,
    cover_object_key: coverObjectKey,
    is_smart: Boolean(playlist.is_smart),
    smart_rules: playlist.smart_rules,
    sort_order: playlist.sort_order,
    created_at: playlist.created_at,
    updated_at: playlist.updated_at,
    track_hashes: trackHashes,
  };
}

export async function buildLocalManifest(
  config: CloudStorageConfig,
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<{ manifest: CloudLibraryManifestV1; localTracks: LocalCloudTrack[]; localArtworks: LocalCloudArtwork[] }> {
  const db = getDb();
  const deviceId = getDesktopCloudDeviceId();
  const now = Date.now();
  const tracks = db.prepare('SELECT DISTINCT t.* FROM tracks t ORDER BY t.added_at DESC, t.id DESC').all() as Track[];
  const localTracks: LocalCloudTrack[] = [];
  const localArtworks: LocalCloudArtwork[] = [];
  const trackEntries: CloudTrackEntry[] = [];

  emitProgress(onProgress, { phase: 'hashing', total: tracks.length });
  for (let index = 0; index < tracks.length; index += 1) {
    throwIfCancelled(shouldCancel);
    const serialized = await serializeLocalTrack(config, tracks[index], localArtworks);
    if (serialized) {
      localTracks.push(serialized.local);
      trackEntries.push(serialized.entry);
    }
    emitProgress(onProgress, {
      phase: 'hashing',
      current: index + 1,
      total: tracks.length,
      ...(serialized ? {} : { failed: 1 }),
    });
  }

  const contentHashByTrackId = new Map(localTracks.map((entry) => [entry.track.id, entry.contentHash]));
  const playlists = db.prepare('SELECT * FROM playlists ORDER BY sort_order ASC, updated_at DESC').all() as Playlist[];
  const playlistEntries: CloudPlaylistEntry[] = [];
  for (const playlist of playlists) {
    throwIfCancelled(shouldCancel);
    playlistEntries.push(await serializeLocalPlaylist(config, playlist, contentHashByTrackId, localArtworks));
  }
  const revision = buildCloudRevision(deviceId, now);
  return {
    manifest: {
      schema_version: 1,
      app: 'TON',
      created_at: now,
      updated_at: now,
      device_id: deviceId,
      revision,
      library_track_hashes: [...new Set(localTracks.map((entry) => entry.contentHash))],
      tracks: trackEntries,
      playlists: playlistEntries,
    },
    localTracks,
    localArtworks,
  };
}
