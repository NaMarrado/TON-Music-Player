import * as FileSystem from 'expo-file-system';
import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { getDb } from '../database';
import { insertTrack } from '../db-queries';
import { MUSIC_DIR } from '../downloader/filesystem';
import { ensureUniqueLocalFilePathAsync } from '../library-transfer/file-helpers';
import { audioFormatFromExtension } from '../library-transfer/media';
import {
  clearMobileCloudDownloadFailure,
  prepareMobileCloudDownloadFailures,
  recordMobileCloudDownloadFailure,
  type MobileCloudDownloadFailureContext,
} from './download-failures';
import { shouldDeferCloudTrackDownload } from './download-failure-policy';
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
  file_path: string;
  file_size: number;
  format: CloudLibraryManifestV1['tracks'][number]['format'];
};

type MaterializedAudio = {
  filePath: string;
  fileSize: number;
  format: CloudLibraryManifestV1['tracks'][number]['format'];
};

function throwIfFetchCancelled(shouldCancel?: CancelSignal, abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) throw new Error('cloud_sync_cancelled');
  throwIfCancelled(shouldCancel);
}

async function downloadTrackAudio(input: {
  client: MobileR2Client;
  track: CloudLibraryManifestV1['tracks'][number];
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
}): Promise<MaterializedAudio> {
  const { client, track, shouldCancel, abortSignal } = input;
  const destinationUri = await ensureUniqueLocalFilePathAsync(
    MUSIC_DIR, buildImportedFileName(track), track.content_hash_sha256,
  );
  throwIfFetchCancelled(shouldCancel, abortSignal);
  await downloadVerifiedCloudFile(
    client, track.object_key, destinationUri, track.content_hash_sha256, abortSignal,
  );
  throwIfFetchCancelled(shouldCancel, abortSignal);
  const requestedFormat = track.format
    ?? audioFormatFromExtension(getFileExtension(destinationUri, null));
  const audio = await normalizeCloudAudioForPlayback(destinationUri, requestedFormat);
  const info = await FileSystem.getInfoAsync(audio.filePath, { size: true });
  if (!info.exists) throw new Error('cloud_sync_downloaded_file_missing');
  return {
    filePath: audio.filePath,
    fileSize: typeof info.size === 'number' ? info.size : track.file_size ?? 0,
    format: audio.format ?? requestedFormat,
  };
}

async function resolveTrackArtwork(input: {
  client: MobileR2Client;
  track: CloudLibraryManifestV1['tracks'][number];
  existingPath: string | null;
  abortSignal?: AbortSignal;
}): Promise<{ coverPath: string | null; failed: boolean }> {
  const { client, track, existingPath, abortSignal } = input;
  if (!track.artwork_object_key || !track.artwork_hash_sha256) {
    return { coverPath: null, failed: false };
  }
  const coverPath = await ensureUniqueLocalFilePathAsync(
    ARTWORK_DIR,
    track.artwork_file_name || `${track.artwork_hash_sha256}.jpg`,
    track.artwork_hash_sha256,
  );
  if (await fileExists(existingPath)) {
    return { coverPath: existingPath, failed: false };
  }
  try {
    await downloadVerifiedCloudFile(
      client, track.artwork_object_key, coverPath,
      track.artwork_hash_sha256, abortSignal,
    );
    return { coverPath, failed: false };
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    return { coverPath: existingPath, failed: true };
  }
}

async function updateExistingTrack(input: {
  client: MobileR2Client;
  track: CloudLibraryManifestV1['tracks'][number];
  existing: ExistingCloudTrack;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
}): Promise<{ applied: boolean; restored: boolean; assetFailed: boolean }> {
  const { client, track, existing, shouldCancel, abortSignal, applyProtection } = input;
  const downloadedAt = normalizeDownloadedAt(track.downloaded_at);
  const existingDownloadedAt = normalizeDownloadedAt(existing.downloaded_at);
  const reconciledDownloadedAt = existingDownloadedAt && downloadedAt
    ? Math.min(existingDownloadedAt, downloadedAt)
    : existingDownloadedAt ?? downloadedAt;
  const restored = !(await fileExists(existing.file_path));
  const audio = restored
    ? await downloadTrackAudio({ client, track, shouldCancel, abortSignal })
    : { filePath: existing.file_path, fileSize: existing.file_size, format: existing.format };
  throwIfFetchCancelled(shouldCancel, abortSignal);
  const artwork = await resolveTrackArtwork({
    client, track, existingPath: existing.cover_art_path, abortSignal,
  });
  throwIfFetchCancelled(shouldCancel, abortSignal);
  const applied = await withMobileCloudOutboxSuppressed(async (db) => {
    if (applyProtection) {
      const protectedEntities = await getMobileCloudProtectedEntities(
        applyProtection.scopeId, applyProtection.afterGeneration, db,
      );
      if (protectedEntities.trackHashes.has(track.content_hash_sha256)) return false;
    }
    await db.runAsync(
      `UPDATE tracks SET
        file_path = ?, title = ?, artist = ?, album = ?, album_artist = ?, track_number = ?,
        disc_number = ?, duration_ms = ?, genre = ?, year = ?, bitrate = ?,
        sample_rate = ?, file_size = ?, format = ?, cover_art_path = ?,
        loudness_lufs = ?, loudness_gain = ?, youtube_id = ?, spotify_id = ?,
        soundcloud_id = ?, source_url = ?, rating = ?, downloaded_at = ?, in_library = 1
       WHERE id = ?`,
      [
        audio.filePath, track.metadata.title, track.metadata.artist, track.metadata.album,
        track.metadata.album_artist, track.metadata.track_number,
        track.metadata.disc_number, track.metadata.duration_ms, track.metadata.genre,
        track.metadata.year, track.metadata.bitrate, track.metadata.sample_rate,
        audio.fileSize, audio.format, artwork.coverPath, track.metadata.loudness_lufs,
        track.metadata.loudness_gain, track.youtube_id, track.spotify_id,
        track.soundcloud_id, track.source_url, track.metadata.rating,
        reconciledDownloadedAt, existing.id,
      ],
    );
    return true;
  });
  if (!applied && restored) {
    await FileSystem.deleteAsync(audio.filePath, { idempotent: true }).catch(() => {});
  }
  if (applied) {
    existing.file_path = audio.filePath;
    existing.file_size = audio.fileSize;
    existing.format = audio.format;
    existing.downloaded_at = reconciledDownloadedAt;
    existing.in_library = 1;
    existing.cover_art_path = artwork.coverPath;
  }
  return { applied, restored, assetFailed: artwork.failed };
}

async function insertMissingTrack(input: {
  client: MobileR2Client;
  track: CloudLibraryManifestV1['tracks'][number];
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
}): Promise<{ id: number; coverPath: string | null; audio: MaterializedAudio; assetFailed: boolean } | null> {
  const { client, track, shouldCancel, abortSignal, applyProtection } = input;
  const audio = await downloadTrackAudio({ client, track, shouldCancel, abortSignal });
  const artwork = await resolveTrackArtwork({ client, track, existingPath: null, abortSignal });
  throwIfFetchCancelled(shouldCancel, abortSignal);
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
    if (concurrent) return concurrent.id;
    return insertTrack({
      file_path: audio.filePath,
      file_hash: null,
      content_hash_sha256: track.content_hash_sha256,
      file_size: audio.fileSize,
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
      format: audio.format,
      cover_art_path: artwork.coverPath,
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
  return id == null ? null : {
    id, coverPath: artwork.coverPath, audio, assetFailed: artwork.failed,
  };
}

export async function fetchV1Tracks(input: {
  client: MobileR2Client;
  manifest: CloudLibraryManifestV1;
  result: CloudSyncResult;
  onProgress?: ProgressCallback;
  shouldCancel?: CancelSignal;
  abortSignal?: AbortSignal;
  applyProtection?: CloudFetchApplyProtection;
  failureContext?: MobileCloudDownloadFailureContext;
}): Promise<Map<string, number>> {
  const {
    client, manifest, result, onProgress, shouldCancel, abortSignal,
    applyProtection, failureContext,
  } = input;
  const rows = await getDb().getAllAsync<ExistingCloudTrack>(
    `SELECT id, content_hash_sha256, downloaded_at, in_library, cover_art_path,
            file_path, file_size, format
     FROM tracks WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''
     ORDER BY id ASC`,
  );
  const existingByHash = new Map(rows.map((row) => [row.content_hash_sha256, row]));
  const trackIdByHash = new Map<string, number>();
  const deferredFailures = failureContext
    ? await prepareMobileCloudDownloadFailures(failureContext)
    : new Set<string>();
  emitProgress(onProgress, { phase: 'downloading', total: manifest.tracks.length });
  for (let index = 0; index < manifest.tracks.length; index += 1) {
    throwIfFetchCancelled(shouldCancel, abortSignal);
    const track = manifest.tracks[index];
    const existing = existingByHash.get(track.content_hash_sha256);
    const hasLocalAudio = existing ? await fileExists(existing.file_path) : false;
    try {
      if (shouldDeferCloudTrackDownload({
        retryFailed: failureContext?.retryFailed ?? true,
        hasLocalAudio,
        contentHash: track.content_hash_sha256,
        failedHashes: deferredFailures,
      })) {
        result.failed += 1;
        continue;
      }
      if (existing) {
        const updated = await updateExistingTrack({
          client, track, existing, shouldCancel, abortSignal, applyProtection,
        });
        if (updated.applied || hasLocalAudio) {
          trackIdByHash.set(track.content_hash_sha256, existing.id);
        }
        if (updated.restored && updated.applied) result.downloaded += 1;
        else result.skipped += 1;
        if (updated.assetFailed) result.failed += 1;
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
          file_path: inserted.audio.filePath,
          file_size: inserted.audio.fileSize,
          format: inserted.audio.format,
        });
        result.downloaded += 1;
        result.importedTracks += 1;
        if (inserted.assetFailed) result.failed += 1;
      }
      if (failureContext) {
        await clearMobileCloudDownloadFailure(failureContext, track.content_hash_sha256);
      }
    } catch (error) {
      throwIfFetchCancelled(shouldCancel, abortSignal);
      result.failed += 1;
      if (failureContext) {
        await recordMobileCloudDownloadFailure(
          failureContext, track.content_hash_sha256, error,
        );
      }
    } finally {
      emitProgress(onProgress, {
        phase: 'downloading', current: index + 1, total: manifest.tracks.length,
        downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
        message: track.metadata.title ?? undefined,
      });
    }
  }
  return trackIdByHash;
}
