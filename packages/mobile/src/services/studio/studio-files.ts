import * as FileSystem from 'expo-file-system';

/** Everything the Studio creates that is not a finished mix lives here. It is emptied whenever the Studio is cleared. */
export const STUDIO_DIR = `${FileSystem.cacheDirectory}studio/`;
export const STUDIO_DOWNLOAD_DIR = `${STUDIO_DIR}songs/`;
const WORK_DIR = `${STUDIO_DIR}work/`;

export async function ensureDir(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

export async function ensureWorkDir(): Promise<string> {
  await ensureDir(WORK_DIR);
  return WORK_DIR;
}

/** Deletes the work files and, optionally, the temporary downloaded songs. */
export async function clearStudioFiles(includeSongs: boolean): Promise<void> {
  await FileSystem.deleteAsync(WORK_DIR, { idempotent: true });
  if (includeSongs) await FileSystem.deleteAsync(STUDIO_DOWNLOAD_DIR, { idempotent: true });
}

/** ffmpeg wants plain paths: `file://` URIs are stripped and percent-escapes decoded. */
export function toFfmpegPath(uri: string): string {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function writeBytes(uri: string, bytes: Uint8Array): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, uint8ToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
}

export async function writeText(uri: string, text: string): Promise<void> {
  await FileSystem.writeAsStringAsync(uri, text);
}
