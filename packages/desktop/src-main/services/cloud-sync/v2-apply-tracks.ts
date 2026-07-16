import fs from 'node:fs';
import path from 'node:path';
import type {
  CloudLibraryManifestV2,
  CloudSyncResult,
  CloudTrackRecordV2,
} from '@ton/core';
import { compareCloudTracksForLibrary } from '@ton/core';
import { getDb } from '../database';
import { findNonCollidingFileAsync, getLibraryDir } from '../library-paths';
import { ensureArtworkDir, getArtworkDir } from '../metadata-reader/artwork';
import { setDesktopCloudOutboxSuppressed } from './auto-sync-store';
import { DesktopR2Client } from './r2-client';
import {
  buildImportedFileName,
  emitProgress,
  normalizeDownloadedAt,
  pathExists,
} from './sync-common';
import { readCloudApplyProtection } from './v2-apply-protection';
import {
  clearDesktopCloudDownloadFailure,
  prepareDesktopCloudDownloadFailures,
  recordDesktopCloudDownloadFailure,
} from './download-failures';
import { downloadVerifiedCloudFile, isManagedLibraryFile } from './v2-files';
import { throwIfV2Cancelled, type V2SyncOptions } from './v2-types';

export type AppliedTrackState = {
  changedRecords: CloudTrackRecordV2[];
  changedHashes: Set<string>;
  trackIdByHash: Map<string, number>;
};

export async function applyCloudTracksV2(
  client: DesktopR2Client,
  scopeId: string,
  manifest: CloudLibraryManifestV2,
  result: CloudSyncResult,
  options: V2SyncOptions,
  capturedGeneration: number,
  trackMirror: Map<string, string>,
): Promise<AppliedTrackState> {
  const db = getDb();
  const changedRecords = manifest.tracks.filter((record) => (
    options.force || trackMirror.get(record.content_hash_sha256) !== JSON.stringify(record)
  ));
  let protection = readCloudApplyProtection(scopeId, capturedGeneration);
  const isProtected = (hash: string) => protection.protectAll || protection.trackHashes.has(hash);
  const recordsToApply = changedRecords.filter((record) => !isProtected(record.content_hash_sha256));
  const appliedRecords: CloudTrackRecordV2[] = [];
  const changedHashes = new Set<string>();
  const deferredFailures = prepareDesktopCloudDownloadFailures(
    scopeId, manifest.revision, Boolean(options.force),
  );
  const existingRows = db.prepare(`
    SELECT id, content_hash_sha256 FROM tracks
    WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''
  `).all() as Array<{ id: number; content_hash_sha256: string }>;
  const trackIdByHash = new Map(existingRows.map((row) => [row.content_hash_sha256, row.id]));
  const playlistRows = db.prepare(`
    SELECT id, cloud_id FROM playlists WHERE cloud_id IS NOT NULL AND cloud_id != ''
  `).all() as Array<{ id: number; cloud_id: string }>;
  const playlistIdByCloudId = new Map(playlistRows.map((row) => [row.cloud_id, row.id]));
  const membershipsByHash = new Map<string, Array<{
    cloudId: string;
    playlistId: number;
    position: number;
  }>>();
  for (const playlistRecord of manifest.playlists) {
    if (playlistRecord.deleted) continue;
    const playlistId = playlistIdByCloudId.get(playlistRecord.cloud_id);
    if (playlistId == null) continue;
    playlistRecord.entry.track_hashes.forEach((hash, position) => {
      const targets = membershipsByHash.get(hash) ?? [];
      targets.push({ cloudId: playlistRecord.cloud_id, playlistId, position });
      membershipsByHash.set(hash, targets);
    });
  }
  const deleteMembershipAtPosition = db.prepare(`
    DELETE FROM playlist_tracks WHERE playlist_id = ? AND position = ?
  `);
  const findMembershipAtPosition = db.prepare(`
    SELECT track_id FROM playlist_tracks WHERE playlist_id = ? AND position = ? LIMIT 1
  `);
  const insertMembership = db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)
  `);
  const appliedTrackBatch = new Set<number>();
  const flushAppliedTrackBatch = () => {
    if (appliedTrackBatch.size === 0) return;
    options.onTracksApplied?.([...appliedTrackBatch]);
    appliedTrackBatch.clear();
  };
  const queueBlobGc = db.prepare(`
    INSERT INTO cloud_sync_blob_gc (scope_id, object_key, eligible_at) VALUES (?, ?, ?)
    ON CONFLICT(scope_id, object_key) DO UPDATE SET
      eligible_at = MAX(cloud_sync_blob_gc.eligible_at, excluded.eligible_at)
  `);
  const cancelBlobGc = db.prepare(
    'DELETE FROM cloud_sync_blob_gc WHERE scope_id = ? AND object_key = ?',
  );
  const gcEligibleAt = Date.now() + 30 * 24 * 60 * 60 * 1_000;
  const deletedPaths: string[] = [];

  for (const record of recordsToApply) {
    throwIfV2Cancelled(options);
    if (!record.deleted) {
      cancelBlobGc.run(scopeId, record.entry.object_key);
      if (record.entry.artwork_object_key) cancelBlobGc.run(scopeId, record.entry.artwork_object_key);
      continue;
    }
    const previousJson = trackMirror.get(record.content_hash_sha256);
    if (previousJson) {
      try {
        const previous = JSON.parse(previousJson) as CloudTrackRecordV2;
        if (!previous.deleted) {
          queueBlobGc.run(scopeId, previous.entry.object_key, gcEligibleAt);
          if (previous.entry.artwork_object_key) {
            queueBlobGc.run(scopeId, previous.entry.artwork_object_key, gcEligibleAt);
          }
        }
      } catch {
        // A malformed local mirror must not prevent applying the tombstone.
      }
    }
    const rows = db.prepare('SELECT id, file_path FROM tracks WHERE content_hash_sha256 = ?')
      .all(record.content_hash_sha256) as Array<{ id: number; file_path: string }>;
    if (rows.length === 0) {
      trackIdByHash.delete(record.content_hash_sha256);
      appliedRecords.push(record);
      changedHashes.add(record.content_hash_sha256);
      continue;
    }
    setDesktopCloudOutboxSuppressed(() => {
      db.transaction(() => {
        for (const row of rows) {
          db.prepare('DELETE FROM tracks WHERE id = ?').run(row.id);
          if (isManagedLibraryFile(row.file_path)) deletedPaths.push(row.file_path);
        }
      })();
    });
    trackIdByHash.delete(record.content_hash_sha256);
    appliedRecords.push(record);
    changedHashes.add(record.content_hash_sha256);
  }
  await Promise.all(deletedPaths.map((filePath) => (
    fs.promises.rm(filePath, { force: true }).catch(() => undefined)
  )));

  const liveTracks = recordsToApply.filter(
    (record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted,
  ).sort((left, right) => compareCloudTracksForLibrary(left.entry, right.entry));
  emitProgress(options.onProgress, { phase: 'downloading', total: liveTracks.length });
  for (let index = 0; index < liveTracks.length; index += 1) {
    throwIfV2Cancelled(options);
    const record = liveTracks[index];
    const entry = record.entry;
    let trackId = trackIdByHash.get(entry.content_hash_sha256) ?? null;
    const existing = trackId == null ? undefined : db.prepare(`
      SELECT id, file_path, downloaded_at, cover_art_path FROM tracks WHERE id = ?
    `).get(trackId) as {
      id: number;
      file_path: string;
      downloaded_at: number | null;
      cover_art_path: string | null;
    } | undefined;
    let destinationPath = existing?.file_path ?? null;
    const hasLocalAudio = destinationPath != null && await pathExists(destinationPath);
    if (!hasLocalAudio && deferredFailures.has(entry.content_hash_sha256)) {
      result.failed += 1;
      emitTrackProgress(options, result, index, liveTracks.length, entry.metadata.title);
      continue;
    }
    let downloadedAudio = false;
    if (!destinationPath || !(await pathExists(destinationPath))) {
      destinationPath = await findNonCollidingFileAsync(getLibraryDir(), buildImportedFileName(entry));
      try {
        await downloadVerifiedCloudFile(
          client, entry.object_key, destinationPath, entry.content_hash_sha256, options.signal,
        );
      } catch (error) {
        throwIfV2Cancelled(options);
        recordDesktopCloudDownloadFailure(
          scopeId, manifest.revision, entry.content_hash_sha256, error,
        );
        result.failed += 1;
        emitTrackProgress(options, result, index, liveTracks.length, entry.metadata.title);
        continue;
      }
      downloadedAudio = true;
      result.downloaded += 1;
    } else {
      result.skipped += 1;
    }
    const stats = await fs.promises.stat(destinationPath);
    let coverPath = existing?.cover_art_path ?? null;
    let artworkFailed = false;
    if (entry.artwork_object_key && entry.artwork_hash_sha256) {
      await ensureArtworkDir(getArtworkDir());
      const coverExt = path.extname(entry.artwork_file_name || entry.artwork_object_key) || '.jpg';
      coverPath = path.join(getArtworkDir(), `${entry.artwork_hash_sha256}${coverExt}`);
      if (!(await pathExists(coverPath))) {
        try {
          await downloadVerifiedCloudFile(
            client, entry.artwork_object_key, coverPath, entry.artwork_hash_sha256, options.signal,
          );
        } catch (error) {
          throwIfV2Cancelled(options);
          coverPath = existing?.cover_art_path ?? null;
          artworkFailed = true;
          result.failed += 1;
          recordDesktopCloudDownloadFailure(
            scopeId, manifest.revision, entry.content_hash_sha256, error,
          );
        }
      }
    }
    const downloadedAt = normalizeDownloadedAt(entry.downloaded_at);
    throwIfV2Cancelled(options);
    protection = readCloudApplyProtection(scopeId, capturedGeneration);
    if (isProtected(entry.content_hash_sha256)) {
      if (downloadedAudio) await fs.promises.rm(destinationPath, { force: true }).catch(() => undefined);
      continue;
    }
    setDesktopCloudOutboxSuppressed(() => {
      if (trackId == null) {
        const inserted = db.prepare(`
          INSERT INTO tracks (
            file_path, content_hash_sha256, file_size, file_mtime, title, artist,
            album, album_artist, track_number, disc_number, duration_ms, genre,
            year, bitrate, sample_rate, format, cover_art_path, loudness_lufs,
            loudness_gain, youtube_id, spotify_id, soundcloud_id, source_url,
            rating, downloaded_at, added_at, scanned_at, in_library
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(
          destinationPath, entry.content_hash_sha256, stats.size, Math.round(stats.mtimeMs),
          entry.metadata.title, entry.metadata.artist, entry.metadata.album, entry.metadata.album_artist,
          entry.metadata.track_number, entry.metadata.disc_number, entry.metadata.duration_ms,
          entry.metadata.genre, entry.metadata.year, entry.metadata.bitrate, entry.metadata.sample_rate,
          entry.format, coverPath, entry.metadata.loudness_lufs, entry.metadata.loudness_gain,
          entry.youtube_id, entry.spotify_id, entry.soundcloud_id, entry.source_url,
          entry.metadata.rating, downloadedAt, entry.added_at, entry.updated_at,
        );
        trackId = Number(inserted.lastInsertRowid);
        result.importedTracks += 1;
      } else {
        db.prepare(`
          UPDATE tracks SET
            file_path = ?, file_size = ?, file_mtime = ?, title = ?, artist = ?,
            album = ?, album_artist = ?, track_number = ?, disc_number = ?, duration_ms = ?,
            genre = ?, year = ?, bitrate = ?, sample_rate = ?, format = ?, cover_art_path = ?,
            loudness_lufs = ?, loudness_gain = ?, youtube_id = ?, spotify_id = ?,
            soundcloud_id = ?, source_url = ?, rating = ?, added_at = ?, downloaded_at = CASE
              WHEN downloaded_at IS NULL THEN ? WHEN ? IS NULL THEN downloaded_at
              ELSE MIN(downloaded_at, ?) END WHERE id = ?
        `).run(
          destinationPath, stats.size, Math.round(stats.mtimeMs), entry.metadata.title,
          entry.metadata.artist, entry.metadata.album, entry.metadata.album_artist,
          entry.metadata.track_number, entry.metadata.disc_number, entry.metadata.duration_ms,
          entry.metadata.genre, entry.metadata.year, entry.metadata.bitrate, entry.metadata.sample_rate,
          entry.format, coverPath, entry.metadata.loudness_lufs, entry.metadata.loudness_gain,
          entry.youtube_id, entry.spotify_id, entry.soundcloud_id, entry.source_url,
          entry.metadata.rating, entry.added_at,
          downloadedAt, downloadedAt, downloadedAt, trackId,
        );
      }
    });
    if (trackId == null) throw new Error(`Unable to import cloud track ${entry.content_hash_sha256}`);
    trackIdByHash.set(entry.content_hash_sha256, trackId);
    const membershipTargets = membershipsByHash.get(entry.content_hash_sha256) ?? [];
    if (membershipTargets.length > 0) {
      protection = readCloudApplyProtection(scopeId, capturedGeneration);
      setDesktopCloudOutboxSuppressed(() => {
        db.transaction(() => {
          for (const target of membershipTargets) {
            if (protection.protectAll || protection.playlistCloudIds.has(target.cloudId)) continue;
            const current = findMembershipAtPosition.get(
              target.playlistId, target.position,
            ) as { track_id: number } | undefined;
            if (current?.track_id === trackId) continue;
            deleteMembershipAtPosition.run(target.playlistId, target.position);
            insertMembership.run(target.playlistId, trackId, target.position);
          }
        })();
      });
    }
    appliedTrackBatch.add(trackId);
    if (appliedTrackBatch.size >= 32) flushAppliedTrackBatch();
    changedHashes.add(entry.content_hash_sha256);
    if (!artworkFailed) {
      appliedRecords.push(record);
      clearDesktopCloudDownloadFailure(scopeId, entry.content_hash_sha256);
    }
    emitTrackProgress(options, result, index, liveTracks.length, entry.metadata.title);
    if ((index + 1) % 8 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  flushAppliedTrackBatch();
  return { changedRecords: appliedRecords, changedHashes, trackIdByHash };
}

function emitTrackProgress(
  options: V2SyncOptions,
  result: CloudSyncResult,
  index: number,
  total: number,
  title: string | null,
): void {
  emitProgress(options.onProgress, {
    phase: 'downloading', current: index + 1, total,
    downloaded: result.downloaded, skipped: result.skipped, failed: result.failed,
    message: title ?? undefined,
  });
}
