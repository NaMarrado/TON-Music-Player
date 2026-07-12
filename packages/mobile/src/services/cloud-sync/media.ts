import type { AudioFormat } from '@ton/core';

export function getFileExtension(filePath: string, format?: AudioFormat | null): string {
  const clean = filePath.split('?')[0];
  const slashIndex = clean.lastIndexOf('/');
  const fileName = slashIndex >= 0 ? clean.slice(slashIndex + 1) : clean;
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex >= 0) {
    return fileName.slice(dotIndex);
  }
  return format ? `.${format}` : '.bin';
}

export function getFileName(filePath: string): string {
  const clean = filePath.split('?')[0].replace(/\/+$/, '');
  const slashIndex = clean.lastIndexOf('/');
  return slashIndex >= 0 ? clean.slice(slashIndex + 1) : clean;
}

export function contentTypeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.flac':
      return 'audio/flac';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
    case '.opus':
      return 'audio/ogg';
    case '.aac':
      return 'audio/aac';
    case '.m4a':
    case '.mp4':
      return 'audio/mp4';
    case '.webm':
      return 'audio/webm';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}
