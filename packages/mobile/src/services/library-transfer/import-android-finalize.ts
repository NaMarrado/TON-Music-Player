import * as FileSystem from 'expo-file-system';
import type { ExportManifest } from '@ton/core';
import { ensureArtworkDir } from '../cover-art';
import { ensureMusicDir } from '../downloader/filesystem';
import { cleanupStageDirectoryAsync, type LibraryImportResult, type LibraryTransferProgress } from './shared';
import { yieldToUiAsync, ensureUniqueLocalFilePathAsync } from './file-helpers';
import {
  insertImportedLibraryAsync,
  normalizeImportedDownloadedAt,
  type ExistingImportTrackReconciliation,
  type PreparedImportTrack,
} from './import-helpers';
import { buildImportFileName, getBaseName, getFileExtension } from './naming';
import { audioFormatFromExtension } from './media';
import { enqueueMissingImportLoudness } from './import-loudness';
import type { NativeImportResult, StagedImportResult } from './import-types';

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

export async function finalizeAndroidImportResult(
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
  const existingTracksToReconcileById = new Map<number, ExistingImportTrackReconciliation>();
  for (const hash of stagedResult.trackHashesToMarkInLibrary) {
    const identity = stagedResult.existingTrackAliases?.[hash] ?? hash;
    const trackId = existingTrackIdsByHash[identity];
    if (trackId == null) continue;

    const downloadedAt = normalizeImportedDownloadedAt(manifestTracksByHash.get(hash)?.downloaded_at);
    const current = existingTracksToReconcileById.get(trackId);
    existingTracksToReconcileById.set(trackId, {
      trackId,
      downloadedAt: current?.downloadedAt == null
        ? downloadedAt
        : downloadedAt == null
          ? current.downloadedAt
          : Math.min(current.downloadedAt, downloadedAt),
    });
  }

  const trackIdsByHash = { ...existingTrackIdsByHash };
  for (const [manifestHash, existingIdentity] of Object.entries(stagedResult.existingTrackAliases ?? {})) {
    const trackId = existingTrackIdsByHash[existingIdentity];
    if (trackId != null) trackIdsByHash[manifestHash] = trackId;
  }

  const preparedTracks: PreparedImportTrack[] = [];
  const playlistCoverPaths: Record<string, string> = {};
  const createdTrackUris: string[] = [];
  const createdCoverUris: string[] = [];
  const stageDirectoryUri = getParentDirectoryUri(nativeResult.resultFileUri);
  let skippedTracks = nativeResult.skippedTracks;
  const totalFinalizingSteps = stagedResult.preparedTracks.length
    + Object.keys(stagedResult.playlistCoverStagePaths).length + 1;
  let completedFinalizingSteps = 0;
  const reportProgress = () => onProgress?.({
    phase: 'finalizing',
    current: completedFinalizingSteps,
    total: totalFinalizingSteps,
  });

  reportProgress();
  await ensureMusicDir();
  await ensureArtworkDir();

  try {
    for (let index = 0; index < stagedResult.preparedTracks.length; index += 1) {
      const track = stagedResult.preparedTracks[index];
      const manifestTrack = manifestTracksByHash.get(track.fileHash);
      if (!manifestTrack) {
        skippedTracks += 1;
        completedFinalizingSteps += 1;
        reportProgress();
        continue;
      }

      const ext = getFileExtension(manifestTrack.relative_path);
      const destinationUri = await ensureUniqueLocalFilePathAsync(
        `${FileSystem.documentDirectory}music/`,
        buildImportFileName(manifestTrack.metadata.title, manifestTrack.metadata.artist, ext, track.fileHash),
        track.fileHash,
      );
      await FileSystem.moveAsync({ from: track.stagedFilePath, to: destinationUri });
      createdTrackUris.push(destinationUri);
      preparedTracks.push({
        contentHashSha256: track.contentHashSha256 ?? manifestTrack.content_hash_sha256 ?? null,
        downloadedAt: normalizeImportedDownloadedAt(manifestTrack.downloaded_at),
        fileHash: track.fileHash,
        filePath: destinationUri,
        fileSize: track.fileSize,
        format: track.format ?? audioFormatFromExtension(ext),
        inLibrary: track.inLibrary,
        metadata: manifestTrack.metadata,
      });
      completedFinalizingSteps += 1;
      reportProgress();
      if ((index + 1) % 4 === 0) await yieldToUiAsync();
    }

    const playlistCoverEntries = Object.entries(stagedResult.playlistCoverStagePaths);
    for (let index = 0; index < playlistCoverEntries.length; index += 1) {
      const [relativePath, stagedFileUri] = playlistCoverEntries[index];
      const ext = getFileExtension(relativePath) || '.jpg';
      const destinationUri = await ensureUniqueLocalFilePathAsync(
        `${FileSystem.documentDirectory}artwork/`,
        getBaseName(relativePath) || `playlist-cover${ext}`,
        relativePath,
      );
      await FileSystem.moveAsync({ from: stagedFileUri, to: destinationUri });
      createdCoverUris.push(destinationUri);
      playlistCoverPaths[relativePath] = destinationUri;
      completedFinalizingSteps += 1;
      reportProgress();
      if ((index + 1) % 4 === 0) await yieldToUiAsync();
    }

    await yieldToUiAsync();
    const playlistIds = await insertImportedLibraryAsync(
      manifest,
      preparedTracks,
      [...existingTracksToReconcileById.values()],
      trackIdsByHash,
      playlistCoverPaths,
    );
    enqueueMissingImportLoudness(preparedTracks, trackIdsByHash);
    completedFinalizingSteps += 1;
    reportProgress();
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
