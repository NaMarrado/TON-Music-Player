import path from 'node:path';
import type { AudioFormat } from '@ton/core';

export function extensionForTrack(filePath: string, format: AudioFormat | null): string {
  const fromPath = path.extname(filePath);
  if (fromPath) {
    return fromPath;
  }
  return format ? `.${format}` : '.bin';
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
