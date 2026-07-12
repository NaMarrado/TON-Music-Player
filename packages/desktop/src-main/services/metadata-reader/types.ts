import type { AudioFormat } from '@ton/core';

export interface TrackMetadataResult {
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
  format: AudioFormat | null;
  cover_art_path: string | null;
  file_hash: string | null;
}
