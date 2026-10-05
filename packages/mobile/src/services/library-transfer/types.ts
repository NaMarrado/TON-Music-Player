/** What a bundle is. A profile bundle also carries settings with keys, the R2 connection, stars and listening history. */
export type LibraryTransferBundleType = 'library' | 'playlist' | 'songs' | 'profile';

export interface LibraryTransferProgress {
  phase: 'queued' | 'preparing' | 'tracks' | 'playlists' | 'finalizing' | 'sharing' | 'done';
  current: number;
  total: number;
}

export interface LibraryTransferTask<Result> {
  jobId: string;
  cancel: () => Promise<void>;
  result: Promise<Result | null>;
}

export interface LibraryExportResult {
  folderName: string;
  bundleType: LibraryTransferBundleType;
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
}

export interface LibraryExportSelection {
  includeLibrary: boolean;
  outputMode?: 'archive' | 'individual_files';
  playlistIds: number[];
  trackIds?: number[];
  kind?: LibraryTransferBundleType;
}

export interface LibraryImportSource {
  uri: string;
  name: string;
}

export interface LibraryImportResult {
  folderName: string;
  bundleType: LibraryTransferBundleType;
  importedTracks: number;
  skippedTracks: number;
  importedPlaylists: number;
  playlistIds: number[];
  /** True when the bundle was a profile and its settings, keys, stars and listening history were applied. */
  profileApplied: boolean;
}

/** A playlist inside a bundle that is being imported, by its position in the file. */
export interface LibraryImportPlaylistChoice {
  index: number;
  name: string;
  trackCount: number;
}

export interface LibraryImportOptions {
  /** Playlist import: asked once the file is open; returns the chosen positions, or null to cancel the import. */
  choosePlaylists?: (playlists: LibraryImportPlaylistChoice[]) => Promise<number[] | null>;
}
