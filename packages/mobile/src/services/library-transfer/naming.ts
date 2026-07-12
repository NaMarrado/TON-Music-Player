import { sanitizeFilename } from '@ton/core';

export const EXPORT_MANIFEST_NAME = 'manifest.json';
export const EXPORT_TRACKS_DIR_NAME = 'tracks';
export const EXPORT_ARTWORK_DIR_NAME = 'artwork';
export const SUPPORTED_LIBRARY_ARCHIVE_EXTENSIONS = ['.ton', '.zip'] as const;
export const SUPPORTED_LIBRARY_ARCHIVE_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
  'application/octet-stream',
] as const;

export function getFileExtension(value: string): string {
  const cleanValue = value.split('?')[0] ?? value;
  const lastDot = cleanValue.lastIndexOf('.');
  const lastSlash = cleanValue.lastIndexOf('/');
  if (lastDot < 0 || lastDot < lastSlash) {
    return '';
  }
  return cleanValue.slice(lastDot).toLowerCase();
}

export function getBaseName(value: string): string {
  const cleanValue = value.split('?')[0] ?? value;
  const lastSlash = cleanValue.lastIndexOf('/');
  return lastSlash >= 0 ? cleanValue.slice(lastSlash + 1) : cleanValue;
}

export function buildExportArchiveFileName(label?: string | null, now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const prefix = sanitizeFilename(label?.trim() || 'TON Export');
  return `${prefix} - TON - ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.zip`;
}

export function isSupportedLibraryArchiveName(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const lower = value.toLowerCase();
  return SUPPORTED_LIBRARY_ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function buildImportFileName(
  title: string | null,
  artist: string | null,
  ext: string,
  fileHash: string,
): string {
  const stem = sanitizeFilename(`${artist || 'Unknown'} - ${title || 'Untitled'}`) || fileHash;
  return `${stem}${ext || ''}`;
}

export function buildExportTrackFileName(fileHash: string, ext: string): string {
  return `${fileHash}${ext || ''}`;
}
