import path from 'path';
import type { AudioFormat } from '@ton/core';

const FORMAT_MAP: Record<string, AudioFormat> = {
  'MPEG 1 Layer 3': 'mp3',
  'MPEG 2 Layer 3': 'mp3',
  FLAC: 'flac',
  'Ogg Vorbis': 'ogg',
  Opus: 'opus',
  WAVE: 'wav',
  AAC: 'aac',
  'MPEG-4/AAC': 'aac',
  WebM: 'webm',
};

export function detectFormat(
  container?: string,
  codec?: string,
  filePath?: string,
): AudioFormat | null {
  if (codec) {
    for (const [key, format] of Object.entries(FORMAT_MAP)) {
      if (codec.includes(key) || key.includes(codec)) {
        return format;
      }
    }
  }

  if (container) {
    const lowerContainer = container.toLowerCase();
    if (lowerContainer.includes('mpeg')) return 'mp3';
    if (lowerContainer.includes('flac')) return 'flac';
    if (lowerContainer.includes('ogg') || lowerContainer.includes('vorbis')) return 'ogg';
    if (lowerContainer.includes('opus')) return 'opus';
    if (lowerContainer.includes('wav') || lowerContainer.includes('wave')) return 'wav';
    if (lowerContainer.includes('aac') || lowerContainer.includes('m4a') || lowerContainer.includes('mp4')) return 'aac';
    if (lowerContainer.includes('webm')) return 'webm';
  }

  if (filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    const extMap: Record<string, AudioFormat> = {
      mp3: 'mp3',
      flac: 'flac',
      ogg: 'ogg',
      opus: 'opus',
      wav: 'wav',
      aac: 'aac',
      m4a: 'm4a',
      webm: 'webm',
    };
    return extMap[ext] ?? null;
  }

  return null;
}
