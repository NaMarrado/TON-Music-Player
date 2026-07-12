import { downloadCoverArt } from '../cover-art';
import { insertTrack } from '../db-queries';
import type { DownloadFormat, DownloadInput } from './types';

interface PersistDownloadedTrackInput {
  coverUrl: string | null;
  filePath: string;
  fileSize: number;
  format: DownloadFormat;
  input: DownloadInput;
  safeName: string;
  videoId: string;
}

export async function persistDownloadedTrack({
  coverUrl,
  filePath,
  fileSize,
  format,
  input,
  safeName,
  videoId,
}: PersistDownloadedTrackInput): Promise<number> {
  let coverArtPath: string | null = null;
  if (coverUrl) {
    try {
      coverArtPath = await downloadCoverArt(coverUrl, safeName);
    } catch {
      // non-fatal
    }
  }

  return insertTrack({
    file_path: filePath,
    file_hash: null,
    content_hash_sha256: null,
    file_size: fileSize,
    file_mtime: null,
    title: input.title,
    artist: input.artist,
    album: input.album,
    album_artist: null,
    track_number: null,
    disc_number: null,
    duration_ms: input.durationMs,
    genre: null,
    year: null,
    bitrate: null,
    sample_rate: null,
    format,
    cover_art_path: coverArtPath,
    loudness_lufs: null,
    loudness_gain: null,
    youtube_id: videoId,
    spotify_id: input.source === 'spotify' ? input.sourceId : null,
    soundcloud_id: null,
    source_url: input.sourceUrl,
    last_played_at: null,
    rating: null,
    in_library: 1,
  });
}
