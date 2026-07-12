import * as FileSystem from 'expo-file-system';
import { parseBuffer } from 'music-metadata-browser';

interface AudioMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  track_number: number | null;
  disc_number: number | null;
  duration_ms: number | null;
  genre: string | null;
  year: number | null;
  bitrate: number | null;
  sample_rate: number | null;
}

const EMPTY_METADATA: AudioMetadata = {
  title: null, artist: null, album: null, album_artist: null,
  track_number: null, disc_number: null, duration_ms: null,
  genre: null, year: null, bitrate: null, sample_rate: null,
};

function base64ToUint8Array(base64: string): Uint8Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Best-effort metadata reader. On mobile, all tracks come from downloads where
 * we already have metadata from search results. This is a fallback for reading
 * embedded ID3/Vorbis tags from the file itself.
 */
export async function readAudioMetadata(fileUri: string): Promise<AudioMetadata> {
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const buffer = base64ToUint8Array(base64);
    const metadata = await parseBuffer(buffer as never);
    const { common, format } = metadata;

    return {
      title: common.title ?? null,
      artist: common.artist ?? null,
      album: common.album ?? null,
      album_artist: common.albumartist ?? null,
      track_number: common.track?.no ?? null,
      disc_number: common.disk?.no ?? null,
      duration_ms: format.duration ? Math.round(format.duration * 1000) : null,
      genre: common.genre?.[0] ?? null,
      year: common.year ?? null,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      sample_rate: format.sampleRate ?? null,
    };
  } catch {
    return EMPTY_METADATA;
  }
}
