import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { sanitizeFilename, type Track } from '@ton/core';
import { getAllTracksForTransfer } from '../db-queries';
import { copyAndroidLibraryExportFile } from '../native-library-transfer';
import type { LibraryExportResult, LibraryExportSelection, LibraryTransferProgress } from './types';
import { requestDirectoryUriAsync } from './android-storage-access';
import { throwIfLibraryTransferCancelled } from './cancellation';
import {
  waitForUiTransitionAsync,
  yieldToUiAsync,
} from './file-helpers';
import { getFileExtension } from './naming';
import { mimeTypeFromExtension } from './media';
import { shareIosLibraryExportFiles } from './ios-file-sharing';

type PreparedFile = {
  fileName: string;
  sizeBytes: number;
  sourceUri: string;
};

export async function exportMobileTracksIndividually(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<LibraryExportResult | null> {
  const ids = [...new Set(selection.trackIds ?? [])];
  if (selection.includeLibrary || selection.playlistIds.length > 0 || ids.length === 0) {
    throw new Error('Individual file export requires selected Library tracks');
  }

  throwIfLibraryTransferCancelled(shouldCancel);
  onProgress?.({ phase: 'preparing', current: 0, total: ids.length });
  const tracksById = new Map((await getAllTracksForTransfer()).map((track) => [track.id, track]));
  const usedNames = new Set<string>();
  const files: PreparedFile[] = [];
  for (const id of ids) {
    const track = tracksById.get(id);
    if (!track) continue;
    const info = await FileSystem.getInfoAsync(track.file_path, { size: true });
    if (!info.exists) throw new Error(`Cannot export missing Library file: ${track.file_path}`);
    files.push({
      fileName: buildUniqueTrackFileName(track, usedNames),
      sizeBytes: typeof info.size === 'number' ? info.size : 0,
      sourceUri: track.file_path,
    });
  }
  if (files.length === 0) throw new Error('No selected Library tracks can be exported');

  const exported = Platform.OS === 'android'
    ? await exportAndroidFiles(files, onProgress, shouldCancel)
    : await exportIosFiles(files, onProgress, shouldCancel);
  if (!exported) return null;

  onProgress?.({ phase: 'done', current: files.length, total: files.length });
  return {
    folderName: 'TON audio files',
    bundleType: 'library',
    trackCount: files.length,
    playlistCount: 0,
    sizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
  };
}

async function exportIosFiles(
  files: PreparedFile[],
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<boolean> {
  throwIfLibraryTransferCancelled(shouldCancel);
  onProgress?.({ phase: 'sharing', current: files.length, total: files.length });
  await waitForUiTransitionAsync();
  return shareIosLibraryExportFiles(files.map(({ fileName, sourceUri }) => ({
    fileName,
    sourceUri,
  })));
}

async function exportAndroidFiles(
  files: PreparedFile[],
  onProgress?: (progress: LibraryTransferProgress) => void,
  shouldCancel?: (() => boolean) | null,
): Promise<boolean> {
  const directoryUri = await requestDirectoryUriAsync();
  if (!directoryUri) return false;
  for (let index = 0; index < files.length; index += 1) {
    throwIfLibraryTransferCancelled(shouldCancel);
    const file = files[index];
    const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
      directoryUri,
      file.fileName,
      mimeTypeFromExtension(getFileExtension(file.fileName)),
    );
    await copyAndroidLibraryExportFile(file.sourceUri, destinationUri);
    onProgress?.({ phase: 'tracks', current: index + 1, total: files.length });
    await yieldToUiAsync();
  }
  return true;
}

function buildUniqueTrackFileName(track: Track, usedNames: Set<string>): string {
  const extension = getFileExtension(track.file_path)
    || (track.format ? `.${track.format === 'm4a' ? 'm4a' : track.format}` : '');
  const base = sanitizeFilename(
    [track.artist, track.title].filter((value) => value?.trim()).join(' - '),
  ) || `Track ${track.id}`;
  let candidate = `${base}${extension}`;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    candidate = `${base} (${suffix})${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}
