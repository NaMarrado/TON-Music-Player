import type { ExportPlaylistEntry, ExportTrackEntry } from '@ton/core';

export type ExportBundleFormat = 'archive' | 'folder';

export type ExportStartOptions = {
  destinationPath?: string;
  bundleFormat?: ExportBundleFormat;
  includeLibrary?: boolean;
  playlistIds?: number[];
};

export type ImportStartOptions = { bundlePath?: string };

export type ExportDestination = {
  destinationPath: string;
  bundleFormat: ExportBundleFormat;
};

export type ProgressPayload = {
  phase: string;
  current: number;
  total: number;
};

export type ExportResult = {
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
};

export type ExportSummaryResult = {
  exportableTrackCount: number;
  exportablePlaylistCount: number;
};

export type ImportResult = {
  importedTracks: number;
  skippedTracks: number;
  importedPlaylists: number;
};

export type ExportTrackRow = {
  id: number;
  file_path: string;
  file_hash: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  year: number | null;
  duration_ms: number | null;
  loudness_lufs: number | null;
  loudness_gain: number | null;
  cover_art_path: string | null;
  format: string | null;
};

export type ExportPlaylistRow = {
  id: number;
  name: string;
  description: string | null;
  cover_path: string | null;
  is_smart: number;
  smart_rules: string | null;
};

export type PlaylistTrackHashRow = {
  file_hash: string | null;
};

export type PreparedTrackFile = {
  filePath: string;
  archivePath: string;
};

export type PreparedArtworkFile = {
  filePath: string;
  archivePath: string;
};

export type ExportBundleData = {
  libraryTrackHashes: string[];
  trackEntries: ExportTrackEntry[];
  playlistEntries: ExportPlaylistEntry[];
  trackFiles: PreparedTrackFile[];
  artworkFiles: PreparedArtworkFile[];
};

export type ImportPreparedFile = {
  destPath: string;
  hash: string;
  meta: ExportTrackEntry['metadata'];
};

export type CopyImportTracksResult = {
  filesToInsert: ImportPreparedFile[];
  importedTracks: number;
  skippedTracks: number;
};
