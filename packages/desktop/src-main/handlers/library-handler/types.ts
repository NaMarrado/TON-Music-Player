import type { Track } from '@ton/core';
import type { ScanProgress } from '../../services/file-scanner';

export type FileStats = { size: number; mtimeMs: number };

export type ExistingTrackRow = {
  file_path: string;
  file_hash: string | null;
};

export type ExistingLibraryTrack = {
  id: number;
  in_library: number;
};

export type LibraryImportFilesResult = { imported: number };
export type LibraryScanResult = { imported: number; skipped: number };
export type LibraryDeleteMode = 'library-only' | 'everywhere';
export type LibraryDeleteTracksResult = { deleted: number };
export type LibraryExportTrack = Track;
export type LibraryLoudnessResult = { lufs: number; gain: number };
export type LibraryLoudnessAllResult = {
  analyzed: number;
  failed: number;
  total: number;
  noFfmpeg: boolean;
};
export type LibraryLoudnessStats = { total: number; analyzed: number; missing: number };
export type ScanProgressSender = (progress: ScanProgress) => void;
