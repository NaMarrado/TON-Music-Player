export type LibraryTransferBundleType = 'library' | 'playlist';

export interface LibraryTransferProgress {
  phase: 'queued' | 'preparing' | 'tracks' | 'playlists' | 'finalizing' | 'done';
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
  playlistIds: number[];
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
}
