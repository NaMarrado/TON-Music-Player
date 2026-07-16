import fs from 'node:fs';
import path from 'node:path';
import { compareCloudTracksForLibrary } from '@ton/core';
import type { CloudLibraryManifestV1, CloudSyncResult } from '@ton/core';
import { getDb } from '../database';
import { findNonCollidingFileAsync, getLibraryDir } from '../library-paths';
import { ensureArtworkDir, getArtworkDir } from '../metadata-reader/artwork';
import { DesktopR2Client } from './r2-client';
import {
  buildImportedFileName,
  emitProgress,
  normalizeDownloadedAt,
  pathExists,
  throwIfCancelled,
  type CancelSignal,
  type ProgressCallback,
} from './sync-common';

export async function fetchV1Tracks(
  client: DesktopR2Client,
  manifest: CloudLibraryManifestV1,
  result: CloudSyncResult,
  onProgress?: ProgressCallback,
  shouldCancel?: CancelSignal,
): Promise<Map<string, number>> {
  const db = getDb();
  const existingRows = db.prepare(`
    SELECT id, content_hash_sha256 FROM tracks
    WHERE content_hash_sha256 IS NOT NULL AND content_hash_sha256 != '' ORDER BY id ASC
  `).all() as Array<{ id: number; content_hash_sha256: string }>;
  const trackIdByHash = new Map(existingRows.map((row) => [row.content_hash_sha256, row.id]));
  const reconcileExistingTimestamps = db.prepare(`
    UPDATE tracks SET
      added_at = ?,
      downloaded_at = CASE
        WHEN downloaded_at IS NULL THEN ?
        WHEN ? IS NULL THEN downloaded_at
        ELSE MIN(downloaded_at, ?)
      END
    WHERE id = ?
  `);
  await fs.promises.mkdir(getLibraryDir(), { recursive: true });

  const orderedTracks = [...manifest.tracks].sort(compareCloudTracksForLibrary);
  emitProgress(onProgress, { phase: 'downloading', total: orderedTracks.length });
  for (let index = 0; index < orderedTracks.length; index += 1) {
    throwIfCancelled(shouldCancel);
    const track = orderedTracks[index];
    const existingTrackId = trackIdByHash.get(track.content_hash_sha256);
    if (existingTrackId != null) {
      const downloadedAt = normalizeDownloadedAt(track.downloaded_at);
      reconcileExistingTimestamps.run(
        track.added_at,
        downloadedAt,
        downloadedAt,
        downloadedAt,
        existingTrackId,
      );
      result.skipped += 1;
    } else {
      const destinationPath = await findNonCollidingFileAsync(getLibraryDir(), buildImportedFileName(track));
      await client.downloadFile(track.object_key, destinationPath);
      const destinationStats = await fs.promises.stat(destinationPath);
      let coverPath: string | null = null;
      if (track.artwork_object_key && track.artwork_hash_sha256) {
        await ensureArtworkDir(getArtworkDir());
        coverPath = path.join(getArtworkDir(), track.artwork_file_name || `${track.artwork_hash_sha256}.jpg`);
        if (!(await pathExists(coverPath))) await client.downloadFile(track.artwork_object_key, coverPath);
      }
      const insertResult = db.prepare(`
        INSERT INTO tracks (
          file_path, file_hash, content_hash_sha256, file_size, file_mtime,
          title, artist, album, album_artist, track_number, disc_number,
          duration_ms, genre, year, bitrate, sample_rate, format, cover_art_path,
          loudness_lufs, loudness_gain, youtube_id, spotify_id, soundcloud_id, source_url,
          rating, downloaded_at, added_at, in_library
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        destinationPath, null, track.content_hash_sha256, destinationStats.size, null,
        track.metadata.title, track.metadata.artist, track.metadata.album, track.metadata.album_artist,
        track.metadata.track_number, track.metadata.disc_number, track.metadata.duration_ms,
        track.metadata.genre, track.metadata.year, track.metadata.bitrate, track.metadata.sample_rate,
        track.format, coverPath, track.metadata.loudness_lufs, track.metadata.loudness_gain,
        track.youtube_id, track.spotify_id, track.soundcloud_id, track.source_url,
        track.metadata.rating, normalizeDownloadedAt(track.downloaded_at), track.added_at, 1,
      );
      trackIdByHash.set(track.content_hash_sha256, Number(insertResult.lastInsertRowid));
      result.downloaded += 1;
      result.importedTracks += 1;
    }
    emitProgress(onProgress, {
      phase: 'downloading', current: index + 1, total: orderedTracks.length,
      downloaded: result.downloaded, skipped: result.skipped,
    });
  }
  return trackIdByHash;
}
