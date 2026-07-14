import * as FileSystem from 'expo-file-system';
import type JSZip from 'jszip';
import type { ExportManifest } from '@ton/core';
import { ensureArtworkDir } from '../cover-art';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { ensureUniqueLocalFilePathAsync } from './file-helpers';
import { resolveArchiveEntryName } from './import-archive';
import { EXPORT_ARTWORK_DIR_NAME, getBaseName, getFileExtension } from './naming';

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
  if (coverRelativePaths.length === 0) return {};

  await ensureArtworkDir();
  const resolvedCoverPaths: Record<string, string> = {};
  for (const relativePath of coverRelativePaths) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const archiveEntry = zip.file(resolveArchiveEntryName(prefix, relativePath));
    if (!archiveEntry) continue;

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
