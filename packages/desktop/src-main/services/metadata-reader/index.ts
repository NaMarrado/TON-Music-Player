import { parseFile } from 'music-metadata';
import { saveCoverArt } from './artwork';
import { parseFilename } from './filename';
import { detectFormat } from './format';
import { computeFileHash } from './hash';
import type { TrackMetadataResult } from './types';

export type { TrackMetadataResult } from './types';

export async function readTrackMetadata(
  filePath: string,
  fileSize: number,
): Promise<TrackMetadataResult> {
  const fileHash = computeFileHash(filePath, fileSize);
  const filenameParsed = parseFilename(filePath);

  try {
    const metadata = await parseFile(filePath, { skipCovers: false, duration: true });
    const { common, format } = metadata;
    const coverArtPath = common.picture
      ? await saveCoverArt(common.picture as Array<{ format: string; data: Buffer }>, fileHash)
      : null;

    return {
      title: common.title || filenameParsed.title,
      artist: common.artist || filenameParsed.artist,
      album: common.album || null,
      album_artist: common.albumartist || null,
      track_number: common.track?.no ?? null,
      disc_number: common.disk?.no ?? null,
      duration_ms: format.duration ? Math.round(format.duration * 1000) : null,
      genre: common.genre?.[0] || null,
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
