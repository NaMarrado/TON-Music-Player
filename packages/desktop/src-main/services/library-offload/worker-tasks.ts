import fs from 'node:fs';
import path from 'node:path';
import type { AudioFormat } from '@ton/core';
import type { TrackMetadataResult } from '../metadata-reader/types';

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
} as const;

function ensureArtworkDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function saveCoverArtToDir(
  pictures: { format?: string; data: Uint8Array }[] | undefined,
  fileHash: string,
  artworkDir: string,
): string | null {
  const dir = ensureArtworkDir(artworkDir);
  if (!pictures || pictures.length === 0) {
    return null;
  }

  const picture = pictures[0];
  const ext = picture.format?.includes('png') ? '.png' : '.jpg';
  const artworkPath = path.join(dir, `${fileHash}${ext}`);
  if (fs.existsSync(artworkPath)) {
    return artworkPath;
  }

  try {
    fs.writeFileSync(artworkPath, picture.data);
    return artworkPath;
  } catch {
    return null;
  }
}

function parseFilename(filePath: string): { artist: string | null; title: string | null } {
  const stem = path.basename(filePath, path.extname(filePath));
  const strippedStem = stem.replace(/^\d{1,3}[\s.\-]+\s*/, '');
  const separatorMatch = strippedStem.match(/^(.+?)\s+[-\u2013\u2014]\s+(.+)$/);
  if (separatorMatch) {
    return {
      artist: separatorMatch[1].trim(),
      title: separatorMatch[2].trim(),
    };
  }

  return { artist: null, title: strippedStem };
}

function detectFormat(
  container: string | undefined,
  codec: string | undefined,
  filePath: string,
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

function computeFileHash(filePath: string, fileSize: number): string {
  const chunkSize = 65536;
  const fd = fs.openSync(filePath, 'r');
  try {
    const headBuffer = Buffer.alloc(Math.min(chunkSize, fileSize));
    fs.readSync(fd, headBuffer, 0, headBuffer.length, 0);
    let tailBuffer = Buffer.alloc(0);
    if (fileSize > chunkSize) {
      tailBuffer = Buffer.alloc(Math.min(chunkSize, fileSize));
      fs.readSync(fd, tailBuffer, 0, tailBuffer.length, fileSize - tailBuffer.length);
    }

    let hash = 2166136261;
    for (const buffer of [headBuffer, tailBuffer]) {
      for (let index = 0; index < buffer.length; index += 1) {
        hash ^= buffer[index];
        hash = Math.imul(hash, 16777619);
      }
    }

    hash ^= fileSize;
    hash = Math.imul(hash, 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  } finally {
    fs.closeSync(fd);
  }
}

export function scanAudioDirectory(dirPath: string, supportedExtensions: string[]): string[] {
  const results: string[] = [];
  const extensions = new Set(supportedExtensions);

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'Playlists') {
          walk(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return results;
}

export async function readTrackMetadataInWorker(
  filePath: string,
  fileSize: number,
  artworkDir: string,
): Promise<TrackMetadataResult> {
  const { parseFile } = await import('music-metadata');
  const fileHash = computeFileHash(filePath, fileSize);
  const filenameParsed = parseFilename(filePath);

  try {
    const metadata = await parseFile(filePath, { skipCovers: false, duration: true });
    const common = metadata.common;
    const format = metadata.format;
    const coverArtPath = common.picture
      ? saveCoverArtToDir(common.picture, fileHash, artworkDir)
      : null;

    return {
      title: common.title || filenameParsed.title,
      artist: common.artist || filenameParsed.artist,
      album: common.album || null,
      album_artist: common.albumartist || null,
      track_number: common.track?.no ?? null,
      disc_number: common.disk?.no ?? null,
      duration_ms: format.duration ? Math.round(format.duration * 1000) : null,
      genre: common.genre?.[0] ?? null,
      year: common.year || null,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      sample_rate: format.sampleRate || null,
      format: detectFormat(format.container, format.codec, filePath),
      cover_art_path: coverArtPath,
      file_hash: fileHash,
    };
  } catch {
    return {
      title: filenameParsed.title,
      artist: filenameParsed.artist,
      album: null,
      album_artist: null,
      track_number: null,
      disc_number: null,
      duration_ms: null,
      genre: null,
      year: null,
      bitrate: null,
      sample_rate: null,
      format: detectFormat(undefined, undefined, filePath),
      cover_art_path: null,
      file_hash: fileHash,
    };
  }
}
