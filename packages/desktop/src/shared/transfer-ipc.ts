/** What an export bundle is. A profile bundle also carries settings with keys, the R2 connection, stars and listening history. */
export type ExportKind = 'library' | 'playlist' | 'songs' | 'profile';

export interface ExportRequest {
  destinationPath?: string;
  bundleFormat?: 'archive' | 'folder';
  includeLibrary?: boolean;
  playlistIds?: number[];
  /** Song export: exactly these library songs. */
  trackIds?: number[];
  kind?: ExportKind;
}

export interface ExportResult {
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
}

/** What a chosen bundle contains, so the user can pick playlists before anything is imported. Null when nothing was chosen. */
export type ImportInspectResult = {
  token: string;
  kind: ExportKind;
  trackCount: number;
  playlists: Array<{ index: number; name: string; trackCount: number }>;
} | null;

export interface ImportRequest {
  bundlePath?: string;
  /** A bundle opened with import:inspect; its unpacked files are reused. */
  inspectToken?: string;
  /** Playlist import: only these playlists (by position in the file) and their songs. */
  playlistIndexes?: number[];
}

export interface ImportResult {
  importedTracks: number;
  skippedTracks: number;
  importedPlaylists: number;
  /** True when the bundle was a profile and its settings, keys, stars and listening history were applied. */
  profileApplied?: boolean;
}
