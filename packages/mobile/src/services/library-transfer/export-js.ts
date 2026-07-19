import {
  cleanupLibraryExportOutputAsync,
  EXPORT_MANIFEST_NAME,
  finalizeLibraryExportOutputAsync,
  prepareLibraryExportArchiveUriAsync,
  requestLibraryExportOutputTargetAsync,
  type LibraryExportResult,
  type LibraryExportSelection,
  type LibraryTransferProgress,
} from './shared';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { buildExportPayload } from './export-payload';
import { writeStoredZipArchive } from './zip-store-writer';

export async function exportMobileLibraryJs(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<LibraryExportResult | null> {
  const payload = await buildExportPayload(selection, onProgress, shouldCancel);
  throwIfLibraryTransferCancelled(shouldCancel);
  const outputTarget = await requestLibraryExportOutputTargetAsync(payload.exportFileName);
  if (!outputTarget) return null;

  let exportArchiveUri: string | null = null;
  try {
    exportArchiveUri = await prepareLibraryExportArchiveUriAsync(
      outputTarget, payload.exportFileName,
    );
    const trackCount = payload.trackFiles.length;
    await writeStoredZipArchive({
      destinationUri: exportArchiveUri,
      shouldCancel,
      entries: [
        {
          archivePath: EXPORT_MANIFEST_NAME,
          bytes: new TextEncoder().encode(`${JSON.stringify(payload.manifest, null, 2)}\n`),
        },
        ...payload.trackFiles.map((file) => ({
          archivePath: file.archivePath,
          filePath: file.filePath,
        })),
        ...payload.artworkFiles.map((file) => ({
          archivePath: file.archivePath,
          filePath: file.filePath,
        })),
      ],
      onEntry: (index) => {
        if (index <= 1) return;
        const mediaIndex = index - 1;
        if (mediaIndex <= trackCount) {
          onProgress?.({ phase: 'tracks', current: mediaIndex, total: trackCount });
        } else {
          onProgress?.({
            phase: 'playlists', current: mediaIndex - trackCount,
            total: payload.artworkFiles.length,
          });
        }
      },
    });
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
