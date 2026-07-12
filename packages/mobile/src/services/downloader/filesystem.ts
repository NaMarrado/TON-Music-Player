import * as FileSystem from 'expo-file-system';

export const MUSIC_DIR = `${FileSystem.documentDirectory}music/`;
const PARTIAL_DOWNLOAD_EXTENSION = '.part';

export async function ensureMusicDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MUSIC_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MUSIC_DIR, { intermediates: true });
  }
}

export async function nativeDownload(
  fetchUrl: string,
  destPath: string,
  reqHeaders: Record<string, string>,
  onProgress?: (loaded: number, total: number) => void,
  onCancelable?: (cancel: () => Promise<void>) => void,
): Promise<{ uri: string; status: number; headers: Record<string, string> } | null> {
  const callback = onProgress
    ? (progress: FileSystem.DownloadProgressData) => {
        if (progress.totalBytesExpectedToWrite > 0) {
          onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
        }
      }
    : undefined;

  const resumable = FileSystem.createDownloadResumable(
    fetchUrl,
    destPath,
    { headers: reqHeaders },
    callback,
  );
  onCancelable?.(() => resumable.cancelAsync());

  const result = await resumable.downloadAsync();
  if (!result) {
    return null;
  }
  return result;
}

export async function cleanupFailedDownload(filePath: string): Promise<void> {
  if (!filePath) {
    return;
  }

  const paths = new Set([filePath]);
  if (!filePath.endsWith(PARTIAL_DOWNLOAD_EXTENSION)) {
    paths.add(`${filePath}${PARTIAL_DOWNLOAD_EXTENSION}`);
  }

  for (const path of paths) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      // Best-effort cleanup for partial downloads.
    }
  }
}
