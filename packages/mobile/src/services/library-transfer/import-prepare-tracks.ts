import * as FileSystem from 'expo-file-system';
import type JSZip from 'jszip';
import type { ExportManifest } from '@ton/core';
import { MUSIC_DIR } from '../downloader/filesystem';
import { audioFormatFromExtension } from './media';
import { buildImportFileName, getFileExtension } from './naming';
import { throwIfLibraryTransferCancelled } from './cancellation';
import type { LibraryTransferProgress } from './types';
import { ensureUniqueLocalFilePathAsync } from './file-helpers';
import { resolveArchiveEntryName } from './import-archive';
import {
  earliestDownloadedAt,
  normalizeImportedDownloadedAt,
  type ExistingImportTrackReconciliation,
  type PreparedImportTrack,
} from './import-helper-types';

export async function prepareImportTracks(
  manifest: ExportManifest,
  zip: JSZip,
  prefix: string,
  existingTrackIdsByHash: Record<string, number>,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<{
  preparedTracks: PreparedImportTrack[];
  existingTracksToReconcile: ExistingImportTrackReconciliation[];
  trackIdsByHash: Record<string, number>;
  skippedTracks: number;
}> {
  const preparedTracksByHash = new Map<string, PreparedImportTrack>();
  const trackIdsByHash = { ...existingTrackIdsByHash };
  const existingTracksToReconcile = new Map<number, ExistingImportTrackReconciliation>();
  let skippedTracks = 0;
  onProgress?.({ phase: 'tracks', current: 0, total: manifest.tracks.length });

  for (let index = 0; index < manifest.tracks.length; index += 1) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const entry = manifest.tracks[index];
    const downloadedAt = normalizeImportedDownloadedAt(entry.downloaded_at);
    const existingTrackId = existingTrackIdsByHash[entry.file_hash];
    if (existingTrackId) {
      const current = existingTracksToReconcile.get(existingTrackId);
      existingTracksToReconcile.set(existingTrackId, {
        trackId: existingTrackId,
        downloadedAt: earliestDownloadedAt(current?.downloadedAt ?? null, downloadedAt),
      });
      skippedTracks += 1;
      onProgress?.({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
      continue;
    }

    const duplicate = preparedTracksByHash.get(entry.file_hash);
    if (duplicate) {
      duplicate.downloadedAt = earliestDownloadedAt(duplicate.downloadedAt, downloadedAt);
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
    const destinationUri = await ensureUniqueLocalFilePathAsync(
      MUSIC_DIR,
      buildImportFileName(entry.metadata.title, entry.metadata.artist, ext, entry.file_hash),
      entry.file_hash,
    );
    const trackBase64 = await archiveTrackEntry.async('base64');
    throwIfLibraryTransferCancelled(shouldCancel);
    await FileSystem.writeAsStringAsync(destinationUri, trackBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const info = await FileSystem.getInfoAsync(destinationUri, { size: true });
    preparedTracksByHash.set(entry.file_hash, {
      contentHashSha256: entry.content_hash_sha256 ?? null,
      downloadedAt,
      fileHash: entry.file_hash,
      filePath: destinationUri,
      fileSize: info.exists && typeof info.size === 'number' ? info.size : null,
      format: audioFormatFromExtension(ext),
      inLibrary: true,
      metadata: entry.metadata,
    });
    onProgress?.({ phase: 'tracks', current: index + 1, total: manifest.tracks.length });
  }

  return {
    preparedTracks: [...preparedTracksByHash.values()],
    existingTracksToReconcile: [...existingTracksToReconcile.values()],
    trackIdsByHash,
    skippedTracks,
  };
}
