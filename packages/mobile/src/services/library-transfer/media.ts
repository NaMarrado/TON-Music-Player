import type { AudioFormat } from '@ton/core';

export function audioFormatFromExtension(ext: string): AudioFormat | null {
  switch (ext.toLowerCase()) {
    case '.mp3':
      return 'mp3';
    case '.flac':
      return 'flac';
    case '.wav':
      return 'wav';
    case '.ogg':
      return 'ogg';
    case '.aac':
      return 'aac';
    case '.m4a':
    case '.mp4':
      return 'm4a';
    case '.webm':
      return 'webm';
    case '.opus':
      return 'opus';
    default:
      return null;
  }
}

export function mimeTypeFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.json':
      return 'application/json';
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
    default:
      return 'application/octet-stream';
  }
}
