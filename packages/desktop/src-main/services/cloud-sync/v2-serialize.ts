import path from 'node:path';
import type { CloudStorageConfig, Playlist, Track } from '@ton/core';
import {
  buildCloudContentArtworkObjectKey,
  buildCloudContentAudioObjectKey,
} from '@ton/core';
import { getDb } from '../database';
import { hashCloudArtworkFile } from './hash-cache';
import { contentTypeForExtension, extensionForTrack } from './media';
import { pathExists, type LocalCloudArtwork } from './sync-common';
import { ensurePlaylistCloudId, ensureTrackContentHash } from './v1-local-manifest';
import type { SerializedPlaylist, SerializedTrack } from './v2-types';

export async function serializeTrackForV2(
  config: CloudStorageConfig,
  trackId: number,
): Promise<SerializedTrack | null> {
  const track = getDb().prepare('SELECT * FROM tracks WHERE id = ?').get(trackId) as Track | undefined;
  if (!track) return null;
  const contentHash = track.content_hash_sha256 || await ensureTrackContentHash(track);
  if (!contentHash) return null;
  const ext = extensionForTrack(track.file_path, track.format);
  const audioObjectKey = buildCloudContentAudioObjectKey(config.prefix, contentHash, ext);
  let artworkHash: string | null = null;
  let artworkObjectKey: string | null = null;
  let artworkFileName: string | null = null;
  if (track.cover_art_path && await pathExists(track.cover_art_path)) {
    artworkHash = await hashCloudArtworkFile(track.cover_art_path);
    const artworkExt = path.extname(track.cover_art_path) || '.jpg';
    artworkObjectKey = buildCloudContentArtworkObjectKey(config.prefix, artworkHash, artworkExt);
    artworkFileName = path.basename(track.cover_art_path);
  }
  return {
    local: {
      track, contentHash, audioObjectKey, artworkHash, artworkObjectKey,
      artworkPath: track.cover_art_path,
    },
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

export async function serializePlaylistForV2(
  config: CloudStorageConfig,
  playlistId: number,
): Promise<SerializedPlaylist | null> {
  const db = getDb();
  const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistId) as Playlist | undefined;
  if (!playlist) return null;
  const cloudId = await ensurePlaylistCloudId(playlist);
  const members = db.prepare(`
    SELECT t.* FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = ? ORDER BY pt.position ASC, pt.id ASC
  `).all(playlistId) as Track[];
  const trackHashes: string[] = [];
  for (const track of members) {
    const hash = track.content_hash_sha256 || await ensureTrackContentHash(track);
    if (hash) trackHashes.push(hash);
  }
  let coverHash: string | null = null;
  let coverObjectKey: string | null = null;
  let cover: LocalCloudArtwork | null = null;
  if (playlist.cover_path && await pathExists(playlist.cover_path)) {
    coverHash = await hashCloudArtworkFile(playlist.cover_path);
    const coverExt = path.extname(playlist.cover_path) || '.jpg';
    coverObjectKey = buildCloudContentArtworkObjectKey(config.prefix, coverHash, coverExt);
    cover = {
      key: coverObjectKey,
      filePath: playlist.cover_path,
      hash: coverHash,
      contentType: contentTypeForExtension(coverExt),
    };
  }
  return {
    localId: playlistId,
    cover,
    entry: {
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
    },
  };
}
