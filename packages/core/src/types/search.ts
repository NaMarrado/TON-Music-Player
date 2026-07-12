export interface SearchResult {
  id: string;
  source: SearchSource;
  library_track_id?: number;
  title: string;
  artist: string;
  album: string | null;
  duration_ms: number | null;
  thumbnail_url: string | null;
  url: string;
  is_downloaded: boolean;
  /** Name of the playlist this track belongs to (only for source: 'playlist'). */
  playlist_name?: string;
}

export type SearchSource = 'youtube' | 'spotify' | 'soundcloud' | 'local' | 'playlist';

export interface SearchQuery {
  query: string;
  sources: SearchSource[];
  limit?: number;
  limitBySource?: Partial<Record<SearchSource, number>>;
  offsetBySource?: Partial<Record<SearchSource, number>>;
  requestId?: number;
}
