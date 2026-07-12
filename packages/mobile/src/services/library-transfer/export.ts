import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import type { ExportManifest, Track } from '@ton/core';
import {
  getAllPlaylists,
  getAllTracksForTransfer,
  getPlaylistTracks,
} from '../db-queries';
import {
  buildExportArchiveFileName,
  cleanupLibraryExportOutputAsync,
  EXPORT_MANIFEST_NAME,
  finalizeLibraryExportOutputAsync,
  type LibraryExportSelection,
  type LibraryExportResult,
  type LibraryTransferTask,
  type LibraryTransferProgress,
  requestLibraryExportOutputTargetAsync,
  writeLibraryExportArchiveAsync,
} from './shared';
import { yieldToUiAsync } from './file-helpers';
import { resolveExportBundleType } from './bundle-type';
import {
  buildExportLabel,
  preparePlaylistEntries,
  prepareTrackExports,
} from './export-helpers';
import {
  isLibraryTransferCancelledError,
  throwIfLibraryTransferCancelled,
} from './cancellation';
import { getLibraryTransferDeviceName } from './platform-label';
import {
  pickAndroidLibraryExportDestination,
} from '../native-library-transfer';
import { acquireMobileJob } from '../job-scheduler';
import {
  canUseNativeLibraryTransfer,
  createLibraryTransferJobId,
  startNativeLibraryExportTask,
} from './runtime';

async function buildExportPayload(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<{
  bundleType: LibraryExportResult['bundleType'];
  exportFileName: string;
  manifest: ExportManifest;
  trackFiles: Array<{ filePath: string; archivePath: string }>;
  artworkFiles: Array<{ filePath: string; archivePath: string }>;
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
}> {
  throwIfLibraryTransferCancelled(shouldCancel);
  onProgress?.({ phase: 'preparing', current: 0, total: 1 });
  await yieldToUiAsync();
  throwIfLibraryTransferCancelled(shouldCancel);
  const allTracks = await getAllTracksForTransfer();
  const allPlaylists = await getAllPlaylists();
  const selectedPlaylistIds = new Set(selection.playlistIds);
  const selectedPlaylists = allPlaylists.filter((playlist) => selectedPlaylistIds.has(playlist.id));
  const bundleType = resolveExportBundleType(selection);
  const exportLabel = buildExportLabel(
    selection,
    selectedPlaylists.map((playlist) => playlist.name),
  );
  const selectedTrackMap = new Map<number, Track>();
  const libraryTrackIds = new Set<number>();
  const playlistTrackIdsByPlaylistId = new Map<number, number[]>();

  if (selection.includeLibrary) {
    for (const track of allTracks) {
      if (track.in_library === 1) {
        selectedTrackMap.set(track.id, track);
        libraryTrackIds.add(track.id);
      }
    }
  }

  for (const playlist of selectedPlaylists) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const playlistTracks = await getPlaylistTracks(playlist.id);
    playlistTrackIdsByPlaylistId.set(
      playlist.id,
      playlistTracks.map((track) => track.id),
    );
    for (const track of playlistTracks) {
      selectedTrackMap.set(track.id, track);
    }
  }

  const selectedTracks = [...selectedTrackMap.values()];
  const { preparedByTrackId, preparedByHash } = await prepareTrackExports(
    selectedTracks,
    onProgress,
    shouldCancel,
  );
  const {
    playlistEntries,
    playlistArtworkBySourceUri,
  } = await preparePlaylistEntries(
    selectedPlaylists,
    playlistTrackIdsByPlaylistId,
    preparedByTrackId,
    onProgress,
    shouldCancel,
  );

  const preparedTracks = [...preparedByHash.values()];
  const trackEntries = preparedTracks.map((prepared) => prepared.trackEntry);
  const libraryTrackHashes = preparedTracks.map((prepared) => prepared.fileHash);
  const sizeBytes = preparedTracks.reduce(
    (sum, prepared) => sum + prepared.sizeBytes,
    0,
  ) + [...playlistArtworkBySourceUri.values()].reduce((sum, prepared) => sum + prepared.sizeBytes, 0);
  const manifest: ExportManifest = {
    version: 1,
    bundle_type: bundleType,
    created_at: Date.now(),
    device_name: getLibraryTransferDeviceName(),
    track_count: trackEntries.length,
    playlist_count: playlistEntries.length,
    total_size_bytes: sizeBytes,
    library_track_hashes: [...new Set(libraryTrackHashes)],
    tracks: trackEntries,
    playlists: playlistEntries,
  };
  const exportFileName = buildExportArchiveFileName(exportLabel);

  return {
    bundleType,
    exportFileName,
    manifest,
    trackFiles: preparedTracks.map((prepared) => ({
      filePath: prepared.sourceFileUri,
      archivePath: prepared.trackEntry.relative_path,
    })),
    artworkFiles: [...playlistArtworkBySourceUri.values()].map((preparedArtwork) => ({
      filePath: preparedArtwork.sourceFileUri,
      archivePath: preparedArtwork.archivePath,
    })),
    trackCount: trackEntries.length,
    playlistCount: playlistEntries.length,
    sizeBytes,
  };
}

async function exportMobileLibraryJs(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<LibraryExportResult | null> {
  const payload = await buildExportPayload(selection, onProgress, shouldCancel);
  throwIfLibraryTransferCancelled(shouldCancel);
  const outputTarget = await requestLibraryExportOutputTargetAsync(payload.exportFileName);
  if (!outputTarget) {
    return null;
  }
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
    const preparedArtwork = payload.artworkFiles[index];
    const base64 = await FileSystem.readAsStringAsync(preparedArtwork.filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zip.file(preparedArtwork.archivePath, base64, { base64: true });
    onProgress?.({ phase: 'playlists', current: index + 1, total: payload.artworkFiles.length });
  }

  onProgress?.({ phase: 'preparing', current: 1, total: 1 });

  const archiveBase64 = await zip.generateAsync({
    type: 'base64',
    compression: 'STORE',
  });
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

export async function beginExportMobileLibrary(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryExportResult>> {
  if (!canUseNativeLibraryTransfer()) {
    const jobId = createLibraryTransferJobId('library-export');
    const lease = acquireMobileJob({
      kind: 'library-export',
      lane: 'archive-io',
      priority: 'user-blocking',
      onQueued: () => {
        onProgress?.({ phase: 'queued', current: 0, total: 1 });
      },
    });
    let cancelRequested = false;
    let released = false;

    const releaseLease = () => {
      if (released) {
        return;
      }
      released = true;
      lease.release();
    };

    return {
      jobId,
      cancel: async () => {
        if (!lease.isActive()) {
          lease.cancelQueued();
          return;
        }

        cancelRequested = true;
      },
      result: (async () => {
        const started = await lease.started;
        if (!started) {
          return null;
        }

        try {
          return await exportMobileLibraryJs(
            selection,
            onProgress,
            () => cancelRequested,
          );
        } catch (error) {
          if (isLibraryTransferCancelledError(error)) {
            return null;
          }
          throw error;
        } finally {
          releaseLease();
        }
      })(),
    };
  }

  const jobId = createLibraryTransferJobId('library-export');
  const lease = acquireMobileJob({
    kind: 'library-export',
    lane: 'archive-io',
    priority: 'user-blocking',
    onQueued: () => {
      onProgress?.({ phase: 'queued', current: 0, total: 1 });
    },
  });
  let nativeTask: LibraryTransferTask<LibraryExportResult> | null = null;
  let cancelRequested = false;
  let released = false;

  const releaseLease = () => {
    if (released) {
      return;
    }
    released = true;
    lease.release();
  };

  return {
    jobId,
    cancel: async () => {
      if (!lease.isActive()) {
        lease.cancelQueued();
        return;
      }

      if (nativeTask) {
        await nativeTask.cancel();
        return;
      }

      cancelRequested = true;
      return;
    },
    result: (async () => {
      const started = await lease.started;
      if (!started) {
        return null;
      }

      try {
        onProgress?.({ phase: 'preparing', current: 0, total: 1 });
        const payload = await buildExportPayload(selection, onProgress);
        if (cancelRequested) {
          return null;
        }

        const outputUri = await pickAndroidLibraryExportDestination(payload.exportFileName);
        if (!outputUri || cancelRequested) {
          return null;
        }

        nativeTask = await startNativeLibraryExportTask<LibraryExportResult>({
          jobId,
          outputUri,
          fileName: payload.exportFileName,
          bundleType: payload.bundleType,
          manifestJson: JSON.stringify(payload.manifest),
          trackFiles: payload.trackFiles,
          artworkFiles: payload.artworkFiles,
          trackCount: payload.trackCount,
          playlistCount: payload.playlistCount,
          sizeBytes: payload.sizeBytes,
        }, onProgress);

        if (cancelRequested) {
          await nativeTask.cancel();
        }

        return nativeTask.result;
      } finally {
        releaseLease();
      }
    })(),
  };
}

export async function exportMobileLibrary(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryExportResult | null> {
  const task = await beginExportMobileLibrary(selection, onProgress);
  return task.result;
}
