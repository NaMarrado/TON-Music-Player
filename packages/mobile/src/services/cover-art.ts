import * as FileSystem from 'expo-file-system';
import { buildLocalFileUri } from './library-transfer/file-helpers';

const ARTWORK_DIR = `${FileSystem.documentDirectory}artwork/`;

export async function ensureArtworkDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ARTWORK_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ARTWORK_DIR, { intermediates: true });
  }
}

export async function downloadCoverArt(
  url: string,
  filename: string,
): Promise<string> {
  await ensureArtworkDir();
  const ext = url.includes('.png') ? '.png' : '.jpg';
  const destPath = buildLocalFileUri(ARTWORK_DIR, `${filename}${ext}`, 'cover');

  const info = await FileSystem.getInfoAsync(destPath);
  if (info.exists) return destPath;

  const result = await FileSystem.downloadAsync(url, destPath);
  if (result.status !== 200) {
    await FileSystem.deleteAsync(destPath, { idempotent: true });
    throw new Error(`Cover art download failed: ${result.status}`);
  }

  return destPath;
}

export function getCoverArtUri(localPath: string): string {
  if (localPath.startsWith('file://')) return localPath;
  return `file://${localPath}`;
}
