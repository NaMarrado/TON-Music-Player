import * as FileSystem from 'expo-file-system';

function normalizeDirectoryUri(directoryUri: string | null | undefined): string | null {
  if (!directoryUri) {
    return null;
  }

  return directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
}

export function shouldCleanupImportedSourceUri(uri: string): boolean {
  const cacheDirectory = normalizeDirectoryUri(FileSystem.cacheDirectory);
  if (cacheDirectory && uri.startsWith(cacheDirectory)) {
    return true;
  }

  return uri.includes('/Library/Caches/DocumentPicker/');
}

export async function cleanupImportedSourceUriAsync(uri: string | null): Promise<void> {
  if (!uri || !shouldCleanupImportedSourceUri(uri)) {
    return;
  }

  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
