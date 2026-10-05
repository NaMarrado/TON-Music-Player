import type { ExportPlaylistEntry, ExportTrackEntry } from '@ton/core';

export type ExportBundleFormat = 'archive' | 'folder';

export type {
  ExportKind,
  ExportRequest as ExportStartOptions,
  ExportResult,
  ImportInspectResult,
  ImportRequest as ImportStartOptions,
  ImportResult,
} from '../../../src/shared/transfer-ipc';

export type ExportDestination = {
  destinationPath: string;
  bundleFormat: ExportBundleFormat;
};

export type ProgressPayload = {
  phase: string;
  current: number;
  total: number;
};

export type ExportSummaryResult = {
  exportableTrackCount: number;
  exportablePlaylistCount: number;
};

export type ExportTrackRow = {
  id: number;
  file_path: string;
  file_hash: string | null;
  content_hash_sha256: string | null;
  downloaded_at: number | null;
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
  contentHashSha256: string | null;
  downloadedAt: number | null;
  fileSize: number;
  meta: ExportTrackEntry['metadata'];
};
