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
  await db.withExclusiveTransactionAsync(async (txn) => {
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

    for (let index = 0; index < manifest.playlists.length; index += 1) {
      throwIfLibraryTransferCancelled(shouldCancel);
      const playlist = manifest.playlists[index];
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

      let position = 0;
      for (const hash of playlist.track_hashes) {
        throwIfLibraryTransferCancelled(shouldCancel);
        const trackId = trackIdsByHash[hash];
        if (!trackId) continue;
        await txn.runAsync(
          'INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
          [playlistId, trackId, position],
        );
        position += 1;
        if (position % 25 === 0) {
          await yieldToUiAsync();
          throwIfLibraryTransferCancelled(shouldCancel);
        }
      }
      onProgress?.({ phase: 'playlists', current: index + 1, total: manifest.playlists.length });
      await yieldToUiAsync();
      throwIfLibraryTransferCancelled(shouldCancel);
    }
  });
  return playlistIds;
}
