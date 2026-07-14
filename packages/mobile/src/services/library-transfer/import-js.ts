import { getTrackIdsByTransferEntries } from '../db-queries';
import { ensureMusicDir } from '../downloader/filesystem';
import {
  cleanupStageDirectoryAsync,
  copySafFileToLocalAsync,
  createStageDirectoryAsync,
  type LibraryImportResult,
  type LibraryImportSource,
  type LibraryTransferProgress,
} from './shared';
import { yieldToUiAsync } from './file-helpers';
import { resolveImportBundleType } from './bundle-type';
import { loadArchiveBundleAsync } from './import-archive';
import { insertImportedLibraryAsync, prepareImportPlaylistCovers, prepareImportTracks } from './import-helpers';
import { cleanupImportedSourceUriAsync } from './import-source-cleanup';
import { throwIfLibraryTransferCancelled } from './cancellation';
import { enqueueMissingImportLoudness } from './import-loudness';
import * as FileSystem from 'expo-file-system';

async function deleteFileAsync(fileUri: string): Promise<void> {
  await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
}

export async function importMobileLibraryJs(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<LibraryImportResult | null> {
  let stageDirectoryUri: string | null = null;
  let createdTrackUris: string[] = [];
  let createdCoverUris: string[] = [];

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
      existingTracksToReconcile,
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
      existingTracksToReconcile,
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
    await cleanupImportedSourceUriAsync(source.uri);
    if (stageDirectoryUri) await cleanupStageDirectoryAsync(stageDirectoryUri);
  }
}
