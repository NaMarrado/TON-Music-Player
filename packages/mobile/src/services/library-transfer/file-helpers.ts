import * as FileSystem from 'expo-file-system';
import { sanitizeFilename } from '@ton/core';
import { getFileExtension } from './naming';

const PORTABLE_EXTENSION = /^\.[a-z0-9]{1,10}$/i;

function encodeFileUriSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

export function buildLocalFileUri(
  directoryUri: string,
  preferredFileName: string,
  fallbackStem = 'file',
): string {
  const extension = getFileExtension(preferredFileName);
  const rawStem = extension
    ? preferredFileName.slice(0, -extension.length)
    : preferredFileName;
  const stem = sanitizeFilename(rawStem) || sanitizeFilename(fallbackStem) || 'file';
  const safeExtension = PORTABLE_EXTENSION.test(extension) ? extension.toLowerCase() : '';
  return `${directoryUri}${encodeFileUriSegment(`${stem}${safeExtension}`)}`;
}

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
  const rawStem = ext ? preferredFileName.slice(0, -ext.length) : preferredFileName;
  const stem = sanitizeFilename(rawStem) || fileHash;
  const safeExt = PORTABLE_EXTENSION.test(ext) ? ext.toLowerCase() : '';
  let candidate = buildLocalFileUri(directoryUri, `${stem}${safeExt}`, fileHash);
  let index = 0;

  while ((await FileSystem.getInfoAsync(candidate)).exists) {
    index += 1;
    const suffix = index === 1
      ? `_${fileHash.slice(0, 8)}`
      : `_${fileHash.slice(0, 8)}_${index}`;
    candidate = buildLocalFileUri(directoryUri, `${stem}${suffix}${safeExt}`, fileHash);
  }

  return candidate;
}
