import type { ExportManifest } from '@ton/core';
import { getDb } from '../database';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { yieldToUiAsync } from './file-helpers';
import type { LibraryTransferProgress } from './types';
import {
  earliestDownloadedAt,
  type ExistingImportTrackReconciliation,
  type PreparedImportTrack,
} from './import-helper-types';

const BUSY_RETRIES = 10;

/**
 * An exclusive transaction runs on its own connection, which does not wait for other writers: if the app is writing at
 * that moment it fails at once with "database is locked". The transaction is rolled back then, so it is simply tried again.
 */
async function withBusyRetry(run: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      if (attempt >= BUSY_RETRIES || !String(error).includes('database is locked')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}

async function insertPreparedTracks(
  txn: Awaited<ReturnType<typeof getDb>>,
  preparedTracks: PreparedImportTrack[],
  trackIdsByHash: Record<string, number>,
  shouldCancel?: (() => boolean) | null,
): Promise<void> {
  let insertedTrackCount = 0;
  for (const track of preparedTracks) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const result = await txn.runAsync(
      `INSERT INTO tracks (
        file_path, file_hash, content_hash_sha256, file_size, file_mtime,
        title, artist, album, album_artist,
        track_number, disc_number, duration_ms, genre, year,
        bitrate, sample_rate, format, cover_art_path,
        loudness_lufs, loudness_gain,
        youtube_id, spotify_id, soundcloud_id, source_url,
        last_played_at, rating, downloaded_at, in_library
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        track.filePath, track.fileHash, track.contentHashSha256, track.fileSize, null,
        track.metadata.title, track.metadata.artist, track.metadata.album, null,
        null, null, track.metadata.duration_ms, track.metadata.genre, track.metadata.year,
        null, null, track.format, null, track.metadata.loudness_lufs, track.metadata.loudness_gain,
        null, null, null, null, null, null, track.downloadedAt, 1,
      ],
    );
    trackIdsByHash[track.fileHash] = result.lastInsertRowId;
    insertedTrackCount += 1;
    if (preparedTracks.length > 20 && insertedTrackCount % 20 === 0) {
      await yieldToUiAsync();
      throwIfLibraryTransferCancelled(shouldCancel);
    }
  }
}

export async function insertImportedLibraryAsync(
  manifest: ExportManifest,
  preparedTracks: PreparedImportTrack[],
  existingTracksToReconcile: ExistingImportTrackReconciliation[],
  trackIdsByHash: Record<string, number>,
  playlistCoverPaths: Record<string, string>,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<number[]> {
  const db = getDb();
  const reconciliationsByTrackId = new Map<number, ExistingImportTrackReconciliation>();
  for (const reconciliation of existingTracksToReconcile) {
    const current = reconciliationsByTrackId.get(reconciliation.trackId);
    reconciliationsByTrackId.set(reconciliation.trackId, {
      trackId: reconciliation.trackId,
      downloadedAt: earliestDownloadedAt(current?.downloadedAt ?? null, reconciliation.downloadedAt),
    });
  }
  const maxOrderRow = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM playlists',
  );
  let sortOrder = (maxOrderRow?.m ?? 0) + 1;
  onProgress?.({ phase: 'playlists', current: 0, total: manifest.playlists.length });
  throwIfLibraryTransferCancelled(shouldCancel);

  const playlistIds: number[] = [];
  await withBusyRetry(() => db.withExclusiveTransactionAsync(async (txn) => {
    // A retried attempt starts again from nothing: the failed one was rolled back.
    playlistIds.length = 0;
    for (const reconciliation of reconciliationsByTrackId.values()) {
      throwIfLibraryTransferCancelled(shouldCancel);
      await txn.runAsync(
        `UPDATE tracks SET in_library = 1,
           downloaded_at = CASE WHEN downloaded_at IS NULL OR downloaded_at <= 0 THEN ? ELSE downloaded_at END
         WHERE id = ?`,
        [reconciliation.downloadedAt, reconciliation.trackId],
      );
    }
    await insertPreparedTracks(txn, preparedTracks, trackIdsByHash, shouldCancel);

    // Every playlist in the file is created as it is; other playlists are never touched. Only an identical one (same name,
    // same songs in the same order) is not created twice, so importing the same file again changes nothing.
    for (let index = 0; index < manifest.playlists.length; index += 1) {
      throwIfLibraryTransferCancelled(shouldCancel);
      const playlist = manifest.playlists[index];
      const trackIds = playlist.track_hashes.map((hash) => trackIdsByHash[hash]).filter((trackId): trackId is number => Boolean(trackId));
      const wanted = trackIds.join(',');
      let identical = false;
      for (const row of await txn.getAllAsync<{ id: number }>('SELECT id FROM playlists WHERE lower(trim(name)) = lower(trim(?))', [playlist.name])) {
        const members = await txn.getAllAsync<{ track_id: number }>('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY position, id', [row.id]);
        if (members.map((member) => member.track_id).join(',') === wanted) identical = true;
      }
      if (identical) continue;
      const now = Math.floor(Date.now() / 1000);
      const result = await txn.runAsync(
        `INSERT INTO playlists (name, description, cover_path, is_smart, smart_rules, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          playlist.name,
          playlist.description,
          playlist.cover_relative_path ? (playlistCoverPaths[playlist.cover_relative_path] ?? null) : null,
          playlist.is_smart ? 1 : 0,
          playlist.smart_rules,
          sortOrder,
          now,
          now,
        ],
      );
      const playlistId = result.lastInsertRowId;
      playlistIds.push(playlistId);
      sortOrder += 1;

      for (let position = 0; position < trackIds.length; position += 1) {
        throwIfLibraryTransferCancelled(shouldCancel);
        await txn.runAsync(
          'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
          [playlistId, trackIds[position], position],
        );
        if ((position + 1) % 25 === 0) {
          await yieldToUiAsync();
          throwIfLibraryTransferCancelled(shouldCancel);
        }
      }
      onProgress?.({ phase: 'playlists', current: index + 1, total: manifest.playlists.length });
      await yieldToUiAsync();
      throwIfLibraryTransferCancelled(shouldCancel);
    }
  }));
  return playlistIds;
}
