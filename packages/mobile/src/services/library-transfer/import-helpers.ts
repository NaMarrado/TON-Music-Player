import * as FileSystem from 'expo-file-system';
import type JSZip from 'jszip';
import type { ExportManifest } from '@ton/core';
import { ensureArtworkDir } from '../cover-art';
import { getDb } from '../database';
import { MUSIC_DIR } from '../downloader/filesystem';
import { audioFormatFromExtension } from './media';
import {
  buildImportFileName,
  EXPORT_ARTWORK_DIR_NAME,
  getBaseName,
  getFileExtension,
} from './naming';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { resolveImportBundleType } from './bundle-type';
import type { LibraryTransferProgress } from './types';
import { ensureUniqueLocalFilePathAsync } from './file-helpers';
import { yieldToUiAsync } from './file-helpers';
import { resolveArchiveEntryName } from './import-archive';

export interface PreparedImportTrack {
  fileHash: string;
  filePath: string;
  fileSize: number | null;
  format: ReturnType<typeof audioFormatFromExtension>;
  inLibrary: boolean;
  metadata: ExportManifest['tracks'][number]['metadata'];
}

export async function prepareImportTracks(
  manifest: ExportManifest,
  zip: JSZip,
  prefix: string,
  existingTrackIdsByHash: Record<string, number>,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<{
  preparedTracks: PreparedImportTrack[];
  trackIdsToMarkInLibrary: number[];
  trackIdsByHash: Record<string, number>;
  skippedTracks: number;
}> {
  const bundleType = resolveImportBundleType(manifest);
  const libraryTrackHashes = new Set(
    bundleType === 'playlist'
      ? (manifest.library_track_hashes ?? [])
      : (manifest.library_track_hashes && manifest.library_track_hashes.length > 0
        ? manifest.library_track_hashes
        : manifest.tracks.map((track) => track.file_hash)),
  );
  const preparedTracksByHash = new Map<string, PreparedImportTrack>();
  const trackIdsByHash: Record<string, number> = { ...existingTrackIdsByHash };
  const trackIdsToMarkInLibrary = new Set<number>();
  let skippedTracks = 0;

  onProgress?.({ phase: 'tracks', current: 0, total: manifest.tracks.length });

  for (let index = 0; index < manifest.tracks.length; index += 1) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const entry = manifest.tracks[index];
    const existingTrackId = existingTrackIdsByHash[entry.file_hash];
    if (existingTrackId) {
      if (libraryTrackHashes.has(entry.file_hash)) {
        trackIdsToMarkInLibrary.add(existingTrackId);
      }
      skippedTracks += 1;
      onProgress?.({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    if (preparedTracksByHash.has(entry.file_hash)) {
      skippedTracks += 1;
      onProgress?.({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const archiveTrackEntry = zip.file(resolveArchiveEntryName(prefix, entry.relative_path));
    if (!archiveTrackEntry) {
      skippedTracks += 1;
      onProgress?.({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const ext = getFileExtension(entry.relative_path);
    const preferredName = buildImportFileName(
      entry.metadata.title,
      entry.metadata.artist,
      ext,
      entry.file_hash,
    );
    const destinationUri = await ensureUniqueLocalFilePathAsync(
      MUSIC_DIR,
      preferredName,
      entry.file_hash,
    );

    const trackBase64 = await archiveTrackEntry.async('base64');
    throwIfLibraryTransferCancelled(shouldCancel);
    await FileSystem.writeAsStringAsync(destinationUri, trackBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const info = await FileSystem.getInfoAsync(destinationUri, { size: true });
    const preparedTrack: PreparedImportTrack = {
      fileHash: entry.file_hash,
      filePath: destinationUri,
      fileSize: info.exists && typeof info.size === 'number' ? info.size : null,
      format: audioFormatFromExtension(ext),
      inLibrary: libraryTrackHashes.has(entry.file_hash),
      metadata: entry.metadata,
    };

    preparedTracksByHash.set(entry.file_hash, preparedTrack);
    onProgress?.({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
  }

  return {
    preparedTracks: [...preparedTracksByHash.values()],
    trackIdsToMarkInLibrary: [...trackIdsToMarkInLibrary],
    trackIdsByHash,
    skippedTracks,
  };
}

export async function prepareImportPlaylistCovers(
  manifest: ExportManifest,
  zip: JSZip,
  prefix: string,
  shouldCancel?: (() => boolean) | null,
): Promise<Record<string, string>> {
  const coverRelativePaths = [...new Set(
    manifest.playlists
      .map((playlist) => playlist.cover_relative_path ?? null)
      .filter((value): value is string => Boolean(value)),
  )];

  if (coverRelativePaths.length === 0) {
    return {};
  }

  await ensureArtworkDir();
  const resolvedCoverPaths: Record<string, string> = {};

  for (const relativePath of coverRelativePaths) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const archiveEntry = zip.file(resolveArchiveEntryName(prefix, relativePath));
    if (!archiveEntry) {
      continue;
    }

    const ext = getFileExtension(relativePath) || '.jpg';
    const preferredFileName = getBaseName(relativePath) || `playlist-cover${ext}`;
    const destinationUri = await ensureUniqueLocalFilePathAsync(
      `${FileSystem.documentDirectory}${EXPORT_ARTWORK_DIR_NAME}/`,
      preferredFileName,
      preferredFileName,
    );

    const coverBase64 = await archiveEntry.async('base64');
    throwIfLibraryTransferCancelled(shouldCancel);
    await FileSystem.writeAsStringAsync(destinationUri, coverBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    resolvedCoverPaths[relativePath] = destinationUri;
  }

  return resolvedCoverPaths;
}

export async function insertImportedLibraryAsync(
  manifest: ExportManifest,
  preparedTracks: PreparedImportTrack[],
  trackIdsToMarkInLibrary: number[],
  trackIdsByHash: Record<string, number>,
  playlistCoverPaths: Record<string, string>,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<number[]> {
  const db = getDb();
  const uniqueTrackIdsToMark = [...new Set(trackIdsToMarkInLibrary)];
  const maxOrderRow = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM playlists',
  );
  let sortOrder = (maxOrderRow?.m ?? 0) + 1;

  onProgress?.({ phase: 'playlists', current: 0, total: manifest.playlists.length });
  throwIfLibraryTransferCancelled(shouldCancel);

  const playlistIds: number[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    let insertedTrackCount = 0;

    for (const trackId of uniqueTrackIdsToMark) {
      throwIfLibraryTransferCancelled(shouldCancel);
      await txn.runAsync('UPDATE tracks SET in_library = 1 WHERE id = ?', [trackId]);
    }

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
          last_played_at, rating, in_library
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          track.filePath,
          track.fileHash,
          null,
          track.fileSize,
          null,
          track.metadata.title,
          track.metadata.artist,
          track.metadata.album,
          null,
          null,
          null,
          track.metadata.duration_ms,
          track.metadata.genre,
          track.metadata.year,
          null,
          null,
          track.format,
          null,
          track.metadata.loudness_lufs,
          track.metadata.loudness_gain,
          null,
          null,
          null,
          null,
          null,
          null,
          track.inLibrary ? 1 : 0,
        ],
      );

      trackIdsByHash[track.fileHash] = result.lastInsertRowId;
      insertedTrackCount += 1;

      if (preparedTracks.length > 20 && insertedTrackCount % 20 === 0) {
        await yieldToUiAsync();
        throwIfLibraryTransferCancelled(shouldCancel);
      }
    }

    for (let index = 0; index < manifest.playlists.length; index += 1) {
      throwIfLibraryTransferCancelled(shouldCancel);
      const playlist = manifest.playlists[index];
      const now = Math.floor(Date.now() / 1000);
      const playlistResult = await txn.runAsync(
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
      const playlistId = playlistResult.lastInsertRowId;
      playlistIds.push(playlistId);
      sortOrder += 1;

      let position = 0;
      for (const hash of playlist.track_hashes) {
        throwIfLibraryTransferCancelled(shouldCancel);
        const trackId = trackIdsByHash[hash];
        if (!trackId) {
          continue;
        }

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
