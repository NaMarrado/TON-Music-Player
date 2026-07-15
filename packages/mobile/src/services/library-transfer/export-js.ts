import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import {
  cleanupLibraryExportOutputAsync,
  EXPORT_MANIFEST_NAME,
  finalizeLibraryExportOutputAsync,
  requestLibraryExportOutputTargetAsync,
  writeLibraryExportArchiveAsync,
  type LibraryExportResult,
  type LibraryExportSelection,
  type LibraryTransferProgress,
} from './shared';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { buildExportPayload } from './export-payload';

export async function exportMobileLibraryJs(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<LibraryExportResult | null> {
  const payload = await buildExportPayload(selection, onProgress, shouldCancel);
  throwIfLibraryTransferCancelled(shouldCancel);
  const outputTarget = await requestLibraryExportOutputTargetAsync(payload.exportFileName);
  if (!outputTarget) return null;

  const zip = new JSZip();
  zip.file(EXPORT_MANIFEST_NAME, `${JSON.stringify(payload.manifest, null, 2)}\n`);
  for (let index = 0; index < payload.trackFiles.length; index += 1) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const prepared = payload.trackFiles[index];
    const base64 = await FileSystem.readAsStringAsync(prepared.filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zip.file(prepared.archivePath, base64, { base64: true });
    onProgress?.({ phase: 'tracks', current: index + 1, total: payload.trackFiles.length });
  }
  for (let index = 0; index < payload.artworkFiles.length; index += 1) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const artwork = payload.artworkFiles[index];
    const base64 = await FileSystem.readAsStringAsync(artwork.filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zip.file(artwork.archivePath, base64, { base64: true });
    onProgress?.({ phase: 'playlists', current: index + 1, total: payload.artworkFiles.length });
  }

  onProgress?.({ phase: 'preparing', current: 1, total: 1 });
  const archiveBase64 = await zip.generateAsync({ type: 'base64', compression: 'STORE' });
  throwIfLibraryTransferCancelled(shouldCancel);
  let exportArchiveUri: string | null = null;
  try {
    exportArchiveUri = await writeLibraryExportArchiveAsync(
      outputTarget,
      payload.exportFileName,
      archiveBase64,
    );
    throwIfLibraryTransferCancelled(shouldCancel);
    await finalizeLibraryExportOutputAsync(outputTarget, exportArchiveUri);
    onProgress?.({ phase: 'done', current: 1, total: 1 });
    return {
      folderName: payload.exportFileName,
      bundleType: payload.bundleType,
      trackCount: payload.trackCount,
      playlistCount: payload.playlistCount,
      sizeBytes: payload.sizeBytes,
    };
  } finally {
    await cleanupLibraryExportOutputAsync(outputTarget, exportArchiveUri);
  }
}
