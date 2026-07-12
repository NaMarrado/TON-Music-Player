import * as FileSystem from 'expo-file-system';
import { getFileExtension } from './naming';

export async function yieldToUiAsync(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function createStageDirectoryAsync(prefix: string): Promise<string> {
  const rootDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!rootDirectory) {
    throw new Error('No writable directory is available');
  }

  const directoryUri = `${rootDirectory}${prefix}-${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  return directoryUri;
}

export async function cleanupStageDirectoryAsync(directoryUri: string): Promise<void> {
  await FileSystem.deleteAsync(directoryUri, { idempotent: true }).catch(() => {});
}

export async function ensureUniqueLocalFilePathAsync(
  directoryUri: string,
  preferredFileName: string,
  fileHash: string,
): Promise<string> {
  const ext = getFileExtension(preferredFileName);
  const stem = ext ? preferredFileName.slice(0, -ext.length) : preferredFileName;
  let candidate = `${directoryUri}${preferredFileName}`;
  let index = 0;

  while ((await FileSystem.getInfoAsync(candidate)).exists) {
    index += 1;
    candidate =
      index === 1
        ? `${directoryUri}${stem}_${fileHash.slice(0, 8)}${ext}`
        : `${directoryUri}${stem}_${fileHash.slice(0, 8)}_${index}${ext}`;
  }

  return candidate;
}
