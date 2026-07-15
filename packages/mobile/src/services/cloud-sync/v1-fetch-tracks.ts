import * as FileSystem from 'expo-file-system';
import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { getDb } from '../database';
import { insertTrack } from '../db-queries';
import { MUSIC_DIR } from '../downloader/filesystem';
import { ensureUniqueLocalFilePathAsync } from '../library-transfer/file-helpers';
import { audioFormatFromExtension } from '../library-transfer/media';
import { getMobileCloudProtectedEntities, withMobileCloudOutboxSuppressed } from './local-state';
import { getFileExtension } from './media';
import { MobileR2Client } from './r2-client';
import {
  ARTWORK_DIR,
  buildImportedFileName,
  downloadVerifiedCloudFile,
  emitProgress,
  fileExists,
  normalizeCloudAudioForPlayback,
  normalizeDownloadedAt,
  throwIfCancelled,
  type CancelSignal,
  type CloudFetchApplyProtection,
  type ProgressCallback,
} from './v1-common';

type ExistingCloudTrack = {
  id: number;
  content_hash_sha256: string;
  downloaded_at: number | null;
  in_library: number;
  cover_art_path: string | null;
};

async function updateExistingTrack(input: {
  client: MobileR2Client;
  track: CloudLibraryManifestV1['tracks'][number];
  existing: ExistingCloudTrack;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
}): Promise<boolean> {
  const { client, track, existing, shouldCancel, abortSignal, applyProtection } = input;
  const downloadedAt = normalizeDownloadedAt(track.downloaded_at);
  const existingDownloadedAt = normalizeDownloadedAt(existing.downloaded_at);
  const reconciledDownloadedAt = existingDownloadedAt && downloadedAt
    ? Math.min(existingDownloadedAt, downloadedAt)
    : existingDownloadedAt ?? downloadedAt;
  let coverPath = track.artwork_object_key && track.artwork_hash_sha256
    ? existing.cover_art_path
    : null;
  if (track.artwork_object_key && track.artwork_hash_sha256) {
    coverPath = await ensureUniqueLocalFilePathAsync(
      ARTWORK_DIR,
      track.artwork_file_name || `${track.artwork_hash_sha256}.jpg`,
      track.artwork_hash_sha256,
    );
    throwIfCancelled(shouldCancel);
    if (!(await fileExists(coverPath))) {
      await downloadVerifiedCloudFile(
        client, track.artwork_object_key, coverPath,
        track.artwork_hash_sha256, abortSignal,
      );
    }
  }
  throwIfCancelled(shouldCancel);
  const applied = await withMobileCloudOutboxSuppressed(async (db) => {
    if (applyProtection) {
      const protectedEntities = await getMobileCloudProtectedEntities(
        applyProtection.scopeId, applyProtection.afterGeneration, db,
      );
      if (protectedEntities.trackHashes.has(track.content_hash_sha256)) return false;
    }
    await db.runAsync(
      `UPDATE tracks SET
        title = ?, artist = ?, album = ?, album_artist = ?, track_number = ?,
        disc_number = ?, duration_ms = ?, genre = ?, year = ?, bitrate = ?,
        sample_rate = ?, file_size = ?, format = ?, cover_art_path = ?,
        loudness_lufs = ?, loudness_gain = ?, youtube_id = ?, spotify_id = ?,
        soundcloud_id = ?, source_url = ?, rating = ?, downloaded_at = ?, in_library = 1
       WHERE id = ?`,
      [
        track.metadata.title, track.metadata.artist, track.metadata.album,
        track.metadata.album_artist, track.metadata.track_number,
        track.metadata.disc_number, track.metadata.duration_ms, track.metadata.genre,
        track.metadata.year, track.metadata.bitrate, track.metadata.sample_rate,
        track.file_size, track.format, coverPath, track.metadata.loudness_lufs,
        track.metadata.loudness_gain, track.youtube_id, track.spotify_id,
        track.soundcloud_id, track.source_url, track.metadata.rating,
        reconciledDownloadedAt, existing.id,
      ],
    );
    return true;
  });
  if (applied) {
    existing.downloaded_at = reconciledDownloadedAt;
    existing.in_library = 1;
    existing.cover_art_path = coverPath;
  }
  return applied;
}

async function insertMissingTrack(input: {
  client: MobileR2Client;
  track: CloudLibraryManifestV1['tracks'][number];
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
}): Promise<{ id: number; coverPath: string | null } | null> {
  const { client, track, shouldCancel, abortSignal, applyProtection } = input;
  const destinationUri = await ensureUniqueLocalFilePathAsync(
    MUSIC_DIR, buildImportedFileName(track), track.content_hash_sha256,
  );
  throwIfCancelled(shouldCancel);
  await downloadVerifiedCloudFile(
    client, track.object_key, destinationUri, track.content_hash_sha256, abortSignal,
  );
  throwIfCancelled(shouldCancel);
  const requestedFormat = track.format ?? audioFormatFromExtension(getFileExtension(destinationUri, null));
  const audio = await normalizeCloudAudioForPlayback(destinationUri, requestedFormat);
  let coverPath: string | null = null;
  if (track.artwork_object_key && track.artwork_hash_sha256) {
    coverPath = await ensureUniqueLocalFilePathAsync(
      ARTWORK_DIR,
      track.artwork_file_name || `${track.artwork_hash_sha256}.jpg`,
      track.artwork_hash_sha256,
    );
    throwIfCancelled(shouldCancel);
    if (!(await fileExists(coverPath))) {
      await downloadVerifiedCloudFile(
        client, track.artwork_object_key, coverPath,
        track.artwork_hash_sha256, abortSignal,
      );
    }
  }
  const info = await FileSystem.getInfoAsync(audio.filePath, { size: true });
  throwIfCancelled(shouldCancel);
  const id = await withMobileCloudOutboxSuppressed(async (db) => {
    if (applyProtection) {
      const protectedEntities = await getMobileCloudProtectedEntities(
        applyProtection.scopeId, applyProtection.afterGeneration, db,
      );
      if (protectedEntities.trackHashes.has(track.content_hash_sha256)) return null;
    }
    const concurrent = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM tracks WHERE content_hash_sha256 = ?', [track.content_hash_sha256],
    );
    if (concurrent) return null;
    return insertTrack({
      file_path: audio.filePath,
      file_hash: null,
      content_hash_sha256: track.content_hash_sha256,
      file_size: info.exists && typeof info.size === 'number' ? info.size : track.file_size,
      file_mtime: null,
      title: track.metadata.title,
      artist: track.metadata.artist,
      album: track.metadata.album,
      album_artist: track.metadata.album_artist,
      track_number: track.metadata.track_number,
      disc_number: track.metadata.disc_number,
      duration_ms: track.metadata.duration_ms,
      genre: track.metadata.genre,
      year: track.metadata.year,
      bitrate: track.metadata.bitrate,
      sample_rate: track.metadata.sample_rate,
      format: audio.format ?? requestedFormat,
      cover_art_path: coverPath,
      loudness_lufs: track.metadata.loudness_lufs,
      loudness_gain: track.metadata.loudness_gain,
      youtube_id: track.youtube_id,
      spotify_id: track.spotify_id,
      soundcloud_id: track.soundcloud_id,
      source_url: track.source_url,
      last_played_at: null,
      rating: track.metadata.rating,
      downloaded_at: normalizeDownloadedAt(track.downloaded_at),
      in_library: 1,
    }, db);
  });
  return id == null ? null : { id, coverPath };
}

export async function fetchV1Tracks(input: {
  client: MobileR2Client;
  manifest: CloudLibraryManifestV1;
  result: CloudSyncResult;
  onProgress?: ProgressCallback;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
}): Promise<Map<string, number>> {
  const { client, manifest, result, onProgress, shouldCancel, abortSignal, applyProtection } = input;
  const rows = await getDb().getAllAsync<ExistingCloudTrack>(
    `SELECT id, content_hash_sha256, downloaded_at, in_library, cover_art_path
     FROM tracks WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''
     ORDER BY id ASC`,
  );
  const existingByHash = new Map(rows.map((row) => [row.content_hash_sha256, row]));
  const trackIdByHash = new Map(rows.map((row) => [row.content_hash_sha256, row.id]));
  emitProgress(onProgress, { phase: 'downloading', total: manifest.tracks.length });
  for (let index = 0; index < manifest.tracks.length; index += 1) {
    throwIfCancelled(shouldCancel);
    const track = manifest.tracks[index];
    const existing = existingByHash.get(track.content_hash_sha256);
    if (existing) {
      const applied = await updateExistingTrack({
        client, track, existing, shouldCancel, abortSignal, applyProtection,
      });
      result.skipped += 1;
      if (!applied) continue;
    } else {
      const inserted = await insertMissingTrack({
        client, track, shouldCancel, abortSignal, applyProtection,
      });
      if (!inserted) {
        result.skipped += 1;
        continue;
      }
      trackIdByHash.set(track.content_hash_sha256, inserted.id);
      existingByHash.set(track.content_hash_sha256, {
        id: inserted.id,
        content_hash_sha256: track.content_hash_sha256,
        downloaded_at: normalizeDownloadedAt(track.downloaded_at),
        in_library: 1,
        cover_art_path: inserted.coverPath,
      });
      result.downloaded += 1;
      result.importedTracks += 1;
    }
    emitProgress(onProgress, {
      phase: 'downloading', current: index + 1, total: manifest.tracks.length,
      downloaded: result.downloaded, skipped: result.skipped,
    });
  }
  return trackIdByHash;
}
