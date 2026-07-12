export interface Album {
  name: string;
  artist: string;
  album_artist: string | null;
  year: number | null;
  cover_art_path: string | null;
  track_count: number;
  total_duration_ms: number;
}
