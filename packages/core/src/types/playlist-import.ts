export type PlaylistImportSource = 'soundcloud' | 'spotify' | 'youtube';

export interface PlaylistImportTrack {
  album: string | null;
  artist: string;
  coverUrl: string | null;
  durationMs: number;
  position: number;
  sourceTrackId: string;
  sourceUrl?: string | null;
  title: string;
}

export interface LoadedPlaylistImport {
  name: string;
  source: PlaylistImportSource;
  sourceId: string;
  sourceUrl: string;
  tracks: PlaylistImportTrack[];
}

export interface PlaylistImportResult {
  alreadyQueuedCount: number;
  linkedCount: number;
  playlistId: number;
  playlistName: string;
  queuedCount: number;
  totalCount: number;
}
