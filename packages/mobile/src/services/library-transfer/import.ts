import * as FileSystem from 'expo-file-system';
import type { ExportManifest } from '@ton/core';
import { ensureArtworkDir } from '../cover-art';
import { ensureMusicDir } from '../downloader/filesystem';
import { getAllTrackIdsByHash, getTrackIdsByTransferEntries } from '../db-queries';
import {
  cleanupStageDirectoryAsync,
  copySafFileToLocalAsync,
  createStageDirectoryAsync,
  isSupportedLibraryArchiveName,
  INVALID_LIBRARY_ARCHIVE_ERROR,
  type LibraryImportSource,
  type LibraryImportResult,
  type LibraryTransferTask,
  type LibraryTransferProgress,
} from './shared';
import { yieldToUiAsync } from './file-helpers';
import { resolveImportBundleType } from './bundle-type';
import { loadArchiveBundleAsync } from './import-archive';
import {
  insertImportedLibraryAsync,
  prepareImportPlaylistCovers,
  prepareImportTracks,
  type PreparedImportTrack,
} from './import-helpers';
import { cleanupImportedSourceUriAsync } from './import-source-cleanup';
import {
  canUseNativeLibraryTransfer,
  createLibraryTransferJobId,
  startNativeLibraryImportTask,
} from './runtime';
import {
  isLibraryTransferCancelledError,
  throwIfLibraryTransferCancelled,
} from './cancellation';
import { buildImportFileName, getBaseName, getFileExtension } from './naming';
import { ensureUniqueLocalFilePathAsync } from './file-helpers';
import { audioFormatFromExtension } from './media';
import { acquireMobileJob } from '../job-scheduler';
import { scheduleTrackLoudnessAnalysis } from '../loudness-analysis';

type NativeImportTrackPayload = {
  contentHashSha256?: string | null;
  fileHash: string;
  stagedFilePath: string;
  fileSize: number | null;
  format: PreparedImportTrack['format'];
  inLibrary: boolean;
};

type NativeImportResult = {
  folderName: string;
  bundleType: LibraryImportResult['bundleType'];
  resultFileUri: string;
  skippedTracks: number;
};

type StagedImportResult = {
  bundleType: LibraryImportResult['bundleType'];
  skippedTracks: number;
  manifestFilePath: string;
  preparedTracks: NativeImportTrackPayload[];
  trackHashesToMarkInLibrary: string[];
  existingTrackAliases?: Record<string, string>;
  playlistCoverStagePaths: Record<string, string>;
};

function enqueueMissingImportLoudness(
  preparedTracks: PreparedImportTrack[],
  trackIdsByHash: Record<string, number>,
): void {
  for (const preparedTrack of preparedTracks) {
    if (
      preparedTrack.metadata.loudness_lufs != null
      && preparedTrack.metadata.loudness_gain != null
    ) {
      continue;
    }

    const trackId = trackIdsByHash[preparedTrack.fileHash];
    if (!trackId) {
      continue;
    }

    scheduleTrackLoudnessAnalysis(trackId);
  }
}

function getParentDirectoryUri(fileUri: string): string {
  const normalized = fileUri.endsWith('/') ? fileUri.slice(0, -1) : fileUri;
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex >= 0 ? `${normalized.slice(0, slashIndex + 1)}` : normalized;
}

async function readJsonFileAsync<T>(fileUri: string): Promise<T> {
  const contents = await FileSystem.readAsStringAsync(fileUri);
  return JSON.parse(contents) as T;
}

async function deleteFileAsync(fileUri: string): Promise<void> {
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
}

async function finalizeAndroidImportResult(
  sourceName: string,
  nativeResult: NativeImportResult,
  existingTrackIdsByHash: Record<string, number>,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryImportResult | null> {
  const stagedResult = await readJsonFileAsync<StagedImportResult>(nativeResult.resultFileUri);
  const manifest = await readJsonFileAsync<ExportManifest>(stagedResult.manifestFilePath);
  const manifestTracksByHash = new Map(
    manifest.tracks.map((track) => [track.file_hash, track] as const),
  );
  const trackIdsToMarkInLibrary = stagedResult.trackHashesToMarkInLibrary
    .map((hash) => stagedResult.existingTrackAliases?.[hash] ?? hash)
    .map((identity) => existingTrackIdsByHash[identity])
    .filter((value): value is number => typeof value === 'number');
  const trackIdsByHash = { ...existingTrackIdsByHash };
  for (const [manifestHash, existingIdentity] of Object.entries(
    stagedResult.existingTrackAliases ?? {},
  )) {
    const trackId = existingTrackIdsByHash[existingIdentity];
    if (trackId != null) {
      trackIdsByHash[manifestHash] = trackId;
    }
  }
  const preparedTracks: PreparedImportTrack[] = [];
  const playlistCoverPaths: Record<string, string> = {};
  const createdTrackUris: string[] = [];
  const createdCoverUris: string[] = [];
  const stageDirectoryUri = getParentDirectoryUri(nativeResult.resultFileUri);
  let skippedTracks = nativeResult.skippedTracks;
  const totalFinalizingSteps =
    stagedResult.preparedTracks.length +
    Object.keys(stagedResult.playlistCoverStagePaths).length +
    1;
  let completedFinalizingSteps = 0;

  const reportFinalizingProgress = () => {
    onProgress?.({
      phase: 'finalizing',
      current: completedFinalizingSteps,
      total: totalFinalizingSteps,
    });
  };

  reportFinalizingProgress();
  await ensureMusicDir();
  await ensureArtworkDir();

  try {
    for (let index = 0; index < stagedResult.preparedTracks.length; index += 1) {
      const track = stagedResult.preparedTracks[index];
      const manifestTrack = manifestTracksByHash.get(track.fileHash);
      if (!manifestTrack) {
        skippedTracks += 1;
        completedFinalizingSteps += 1;
        reportFinalizingProgress();
        continue;
      }

      const ext = getFileExtension(manifestTrack.relative_path);
      const destinationUri = await ensureUniqueLocalFilePathAsync(
        `${FileSystem.documentDirectory}music/`,
        buildImportFileName(
          manifestTrack.metadata.title,
          manifestTrack.metadata.artist,
          ext,
          track.fileHash,
        ),
        track.fileHash,
      );
      await FileSystem.moveAsync({ from: track.stagedFilePath, to: destinationUri });
      createdTrackUris.push(destinationUri);
      preparedTracks.push({
        contentHashSha256: track.contentHashSha256
          ?? manifestTrack.content_hash_sha256
          ?? null,
        fileHash: track.fileHash,
        filePath: destinationUri,
        fileSize: track.fileSize,
        format: track.format ?? audioFormatFromExtension(ext),
        inLibrary: track.inLibrary,
        metadata: manifestTrack.metadata,
      });
      completedFinalizingSteps += 1;
      reportFinalizingProgress();

      if ((index + 1) % 4 === 0) {
        await yieldToUiAsync();
      }
    }

    const playlistCoverEntries = Object.entries(stagedResult.playlistCoverStagePaths);
    for (let index = 0; index < playlistCoverEntries.length; index += 1) {
      const [relativePath, stagedFileUri] = playlistCoverEntries[index];
      const ext = getFileExtension(relativePath) || '.jpg';
      const preferredFileName = getBaseName(relativePath) || `playlist-cover${ext}`;
      const destinationUri = await ensureUniqueLocalFilePathAsync(
        `${FileSystem.documentDirectory}artwork/`,
        preferredFileName,
        relativePath,
      );
      await FileSystem.moveAsync({ from: stagedFileUri, to: destinationUri });
      createdCoverUris.push(destinationUri);
      playlistCoverPaths[relativePath] = destinationUri;
      completedFinalizingSteps += 1;
      reportFinalizingProgress();

      if ((index + 1) % 4 === 0) {
        await yieldToUiAsync();
      }
    }

    await yieldToUiAsync();
    const playlistIds = await insertImportedLibraryAsync(
      manifest,
      preparedTracks,
      trackIdsToMarkInLibrary,
      trackIdsByHash,
      playlistCoverPaths,
    );
    enqueueMissingImportLoudness(preparedTracks, trackIdsByHash);

    completedFinalizingSteps += 1;
    reportFinalizingProgress();
    onProgress?.({ phase: 'done', current: 1, total: 1 });
    await cleanupStageDirectoryAsync(stageDirectoryUri);

    return {
      folderName: sourceName,
      bundleType: stagedResult.bundleType,
      importedTracks: preparedTracks.length,
      skippedTracks,
      importedPlaylists: playlistIds.length,
      playlistIds,
    };
  } catch (error) {
    await Promise.all(createdTrackUris.map(deleteFileAsync));
    await Promise.all(createdCoverUris.map(deleteFileAsync));
    await cleanupStageDirectoryAsync(stageDirectoryUri);
    throw error;
  }
}

async function startAndroidImportTask(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryImportResult>> {
  const jobId = createLibraryTransferJobId('library-import');
  const lease = acquireMobileJob({
    kind: 'library-import',
    lane: 'archive-io',
    priority: 'user-blocking',
    onQueued: () => {
      onProgress?.({ phase: 'queued', current: 0, total: 1 });
    },
  });
  let nativeTask: LibraryTransferTask<NativeImportResult> | null = null;
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
        await ensureMusicDir();
        const existingTrackIdsByHash = await getAllTrackIdsByHash();
        if (cancelRequested) {
          return null;
        }

        nativeTask = await startNativeLibraryImportTask<NativeImportResult>({
          jobId,
          sourceUri: source.uri,
          sourceName: source.name,
          existingHashes: Object.keys(existingTrackIdsByHash),
        }, onProgress);

        if (cancelRequested) {
          await nativeTask.cancel();
        }

        const nativeResult = await nativeTask.result;
        if (!nativeResult) {
          return null;
        }

        return finalizeAndroidImportResult(
          source.name,
          nativeResult,
          existingTrackIdsByHash,
          onProgress,
        );
      } finally {
        releaseLease();
      }
    })(),
  };
}

async function importMobileLibraryJs(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<LibraryImportResult | null> {
  let stageDirectoryUri: string | null = null;
  let createdTrackUris: string[] = [];
  let createdCoverUris: string[] = [];
  let sourceUriToCleanup: string | null = source.uri;

  try {
    throwIfLibraryTransferCancelled(shouldCancel);
    onProgress?.({ phase: 'preparing', current: 0, total: 1 });
    await yieldToUiAsync();
    throwIfLibraryTransferCancelled(shouldCancel);

    let archiveUri = source.uri;
    if (archiveUri.startsWith('content://')) {
      stageDirectoryUri = await createStageDirectoryAsync('library-import');
      archiveUri = `${stageDirectoryUri}${source.name}`;
      await copySafFileToLocalAsync(source.uri, archiveUri);
      throwIfLibraryTransferCancelled(shouldCancel);
    }

    const loadedArchive = await loadArchiveBundleAsync(archiveUri);
    throwIfLibraryTransferCancelled(shouldCancel);
    const manifest = loadedArchive.manifest;
    const bundleType = resolveImportBundleType(manifest);
    await ensureMusicDir();

    const existingTrackIdsByHash = await getTrackIdsByTransferEntries(manifest.tracks);

    const {
      preparedTracks,
      trackIdsToMarkInLibrary,
      trackIdsByHash,
      skippedTracks,
    } = await prepareImportTracks(
      manifest,
      loadedArchive.zip,
      loadedArchive.prefix,
      existingTrackIdsByHash,
      onProgress,
      shouldCancel,
    );
    createdTrackUris = preparedTracks.map((track) => track.filePath);

    await yieldToUiAsync();
    throwIfLibraryTransferCancelled(shouldCancel);
    const playlistCoverPaths = await prepareImportPlaylistCovers(
      manifest,
      loadedArchive.zip,
      loadedArchive.prefix,
      shouldCancel,
    );
    createdCoverUris = Object.values(playlistCoverPaths);

    const playlistIds = await insertImportedLibraryAsync(
      manifest,
      preparedTracks,
      trackIdsToMarkInLibrary,
      trackIdsByHash,
      playlistCoverPaths,
      onProgress,
      shouldCancel,
    );
    enqueueMissingImportLoudness(preparedTracks, trackIdsByHash);
    createdTrackUris = [];
    createdCoverUris = [];

    onProgress?.({ phase: 'done', current: 1, total: 1 });

    return {
      folderName: source.name,
      bundleType,
      importedTracks: preparedTracks.length,
      skippedTracks,
      importedPlaylists: playlistIds.length,
      playlistIds,
    };
  } catch (error) {
    await Promise.all(createdTrackUris.map(deleteFileAsync));
    await Promise.all(createdCoverUris.map(deleteFileAsync));
    throw error;
  } finally {
    await cleanupImportedSourceUriAsync(sourceUriToCleanup);
    if (stageDirectoryUri) {
      await cleanupStageDirectoryAsync(stageDirectoryUri);
    }
  }
}

export async function beginImportMobileLibrary(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryImportResult>> {
  if (!isSupportedLibraryArchiveName(source.name)) {
    throw new Error(INVALID_LIBRARY_ARCHIVE_ERROR);
  }

  if (canUseNativeLibraryTransfer()) {
    return startAndroidImportTask(source, onProgress);
  }

  const jobId = createLibraryTransferJobId('library-import');
  const lease = acquireMobileJob({
    kind: 'library-import',
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
        return await importMobileLibraryJs(
          source,
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

export async function importMobileLibrary(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryImportResult | null> {
  const task = await beginImportMobileLibrary(source, onProgress);
  return task.result;
}
