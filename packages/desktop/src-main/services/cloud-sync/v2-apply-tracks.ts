import fs from 'node:fs';
import path from 'node:path';
import type {
  CloudLibraryManifestV2,
  CloudSyncResult,
  CloudTrackRecordV2,
} from '@ton/core';
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
  const changedHashes = new Set(recordsToApply.map((record) => record.content_hash_sha256));
  const existingRows = db.prepare(`
    SELECT id, content_hash_sha256 FROM tracks
    WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != ''
  `).all() as Array<{ id: number; content_hash_sha256: string }>;
  const trackIdByHash = new Map(existingRows.map((row) => [row.content_hash_sha256, row.id]));
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
    if (rows.length === 0) continue;
    setDesktopCloudOutboxSuppressed(() => {
      db.transaction(() => {
        for (const row of rows) {
          db.prepare('DELETE FROM tracks WHERE id = ?').run(row.id);
          if (isManagedLibraryFile(row.file_path)) deletedPaths.push(row.file_path);
        }
      })();
    });
    trackIdByHash.delete(record.content_hash_sha256);
  }
  await Promise.all(deletedPaths.map((filePath) => (
    fs.promises.rm(filePath, { force: true }).catch(() => undefined)
  )));

  const liveTracks = recordsToApply.filter(
    (record): record is Extract<CloudTrackRecordV2, { deleted: false }> => !record.deleted,
  );
  emitProgress(options.onProgress, { phase: 'downloading', total: liveTracks.length });
  for (let index = 0; index < liveTracks.length; index += 1) {
    throwIfV2Cancelled(options);
    const entry = liveTracks[index].entry;
    let trackId = trackIdByHash.get(entry.content_hash_sha256) ?? null;
    const existing = trackId == null ? undefined : db.prepare(`
      SELECT id, file_path, downloaded_at FROM tracks WHERE id = ?
    `).get(trackId) as { id: number; file_path: string; downloaded_at: number | null } | undefined;
    let destinationPath = existing?.file_path ?? null;
    if (!destinationPath || !(await pathExists(destinationPath))) {
      destinationPath = await findNonCollidingFileAsync(getLibraryDir(), buildImportedFileName(entry));
      await downloadVerifiedCloudFile(
        client, entry.object_key, destinationPath, entry.content_hash_sha256, options.signal,
      );
      result.downloaded += 1;
    } else {
      result.skipped += 1;
    }
    const stats = await fs.promises.stat(destinationPath);
    let coverPath: string | null = null;
    if (entry.artwork_object_key && entry.artwork_hash_sha256) {
      await ensureArtworkDir(getArtworkDir());
      const coverExt = path.extname(entry.artwork_file_name || entry.artwork_object_key) || '.jpg';
      coverPath = path.join(getArtworkDir(), `${entry.artwork_hash_sha256}${coverExt}`);
      if (!(await pathExists(coverPath))) {
        await downloadVerifiedCloudFile(
          client, entry.artwork_object_key, coverPath, entry.artwork_hash_sha256, options.signal,
        );
      }
    }
    const downloadedAt = normalizeDownloadedAt(entry.downloaded_at);
    throwIfV2Cancelled(options);
    protection = readCloudApplyProtection(scopeId, capturedGeneration);
    if (isProtected(entry.content_hash_sha256)) continue;
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
            soundcloud_id = ?, source_url = ?, rating = ?, downloaded_at = CASE
              WHEN downloaded_at IS NULL THEN ? WHEN ? IS NULL THEN downloaded_at
              ELSE MIN(downloaded_at, ?) END WHERE id = ?
        `).run(
          destinationPath, stats.size, Math.round(stats.mtimeMs), entry.metadata.title,
          entry.metadata.artist, entry.metadata.album, entry.metadata.album_artist,
          entry.metadata.track_number, entry.metadata.disc_number, entry.metadata.duration_ms,
          entry.metadata.genre, entry.metadata.year, entry.metadata.bitrate, entry.metadata.sample_rate,
          entry.format, coverPath, entry.metadata.loudness_lufs, entry.metadata.loudness_gain,
          entry.youtube_id, entry.spotify_id, entry.soundcloud_id, entry.source_url,
          entry.metadata.rating, downloadedAt, downloadedAt, downloadedAt, trackId,
        );
      }
    });
    if (trackId == null) throw new Error(`Unable to import cloud track ${entry.content_hash_sha256}`);
    trackIdByHash.set(entry.content_hash_sha256, trackId);
    emitProgress(options.onProgress, {
      phase: 'downloading', current: index + 1, total: liveTracks.length,
      downloaded: result.downloaded, skipped: result.skipped,
    });
  }
  return { changedRecords, changedHashes, trackIdByHash };
}
