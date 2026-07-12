import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { requestDirectoryUriAsync } from './android-storage-access';

type AndroidDirectoryTarget = {
  kind: 'android-directory';
  directoryUri: string;
};

type ShareSheetTarget = {
  kind: 'share-sheet';
  fileUri: string;
};

export type LibraryExportOutputTarget = AndroidDirectoryTarget | ShareSheetTarget;

const EXPORT_ARCHIVE_MIME = 'application/zip';
const IOS_ZIP_UTI = 'public.zip-archive';

export function usesShareSheetLibraryExportOutput(): boolean {
  return Platform.OS !== 'android';
}

export async function requestLibraryExportOutputTargetAsync(
  fileName: string,
): Promise<LibraryExportOutputTarget | null> {
  if (Platform.OS === 'android') {
    const directoryUri = await requestDirectoryUriAsync();
    return directoryUri ? { kind: 'android-directory', directoryUri } : null;
  }

  const exportsDirectory = await ensureExportsDirectoryAsync();
  return {
    kind: 'share-sheet',
    fileUri: `${exportsDirectory}${fileName}`,
  };
}

export async function writeLibraryExportArchiveAsync(
  target: LibraryExportOutputTarget,
  fileName: string,
  archiveBase64: string,
): Promise<string> {
  if (target.kind === 'android-directory') {
    const exportArchiveUri = await FileSystem.StorageAccessFramework.createFileAsync(
      target.directoryUri,
      fileName,
      EXPORT_ARCHIVE_MIME,
    );
    await FileSystem.writeAsStringAsync(exportArchiveUri, archiveBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return exportArchiveUri;
  }

  await FileSystem.writeAsStringAsync(target.fileUri, archiveBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return target.fileUri;
}

export async function finalizeLibraryExportOutputAsync(
  target: LibraryExportOutputTarget,
  archiveUri: string,
): Promise<void> {
  if (target.kind !== 'share-sheet') {
    return;
  }

  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) {
    throw new Error('File sharing is unavailable on this device');
  }

  await Sharing.shareAsync(archiveUri, {
    UTI: IOS_ZIP_UTI,
  });
}

export async function cleanupLibraryExportOutputAsync(
  target: LibraryExportOutputTarget,
  archiveUri: string | null,
): Promise<void> {
  if (target.kind !== 'share-sheet' || !archiveUri) {
    return;
  }

  await FileSystem.deleteAsync(archiveUri, { idempotent: true }).catch(() => {});
}

async function ensureExportsDirectoryAsync(): Promise<string> {
  const rootDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!rootDirectory) {
    throw new Error('No writable export directory is available');
  }

  const exportsDirectory = `${rootDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(exportsDirectory, { intermediates: true });
  return exportsDirectory;
}
