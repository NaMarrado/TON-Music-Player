import * as FileSystem from 'expo-file-system';

export function ensureAndroidOnly(): void {
  if (FileSystem.StorageAccessFramework == null) {
    throw new Error('Storage Access Framework is unavailable on this device');
  }
}

export function getPreferredInitialDirectoryUri(): string {
  ensureAndroidOnly();
  return FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
}

export async function requestDirectoryUriAsync(initialUri?: string): Promise<string | null> {
  ensureAndroidOnly();
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
    initialUri ?? getPreferredInitialDirectoryUri(),
  );
  return result.granted ? result.directoryUri : null;
}

export function getSafEntryName(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const slashIndex = decoded.lastIndexOf('/');
  return slashIndex >= 0 ? decoded.slice(slashIndex + 1) : decoded;
}

export async function listSafEntriesByName(
  directoryUri: string,
): Promise<Map<string, string>> {
  const uris = await FileSystem.StorageAccessFramework.readDirectoryAsync(directoryUri);
  return new Map(uris.map((uri) => [getSafEntryName(uri), uri]));
}

export async function copyLocalFileToSafDirectoryAsync(
  sourceUri: string,
  targetDirectoryUri: string,
): Promise<void> {
  await FileSystem.StorageAccessFramework.copyAsync({
    from: sourceUri,
    to: targetDirectoryUri,
  });
}

export async function copySafFileToLocalAsync(sourceUri: string, targetFileUri: string): Promise<void> {
  await FileSystem.StorageAccessFramework.copyAsync({
    from: sourceUri,
    to: targetFileUri,
  });
}
