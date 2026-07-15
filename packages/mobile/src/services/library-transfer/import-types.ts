import type { LibraryImportResult } from './shared';
import type { PreparedImportTrack } from './import-helpers';

export type NativeImportTrackPayload = {
  contentHashSha256?: string | null;
  fileHash: string;
  stagedFilePath: string;
  fileSize: number | null;
  format: PreparedImportTrack['format'];
  inLibrary: boolean;
};

export type NativeImportResult = {
  folderName: string;
  bundleType: LibraryImportResult['bundleType'];
  resultFileUri: string;
  skippedTracks: number;
};

export type StagedImportResult = {
  bundleType: LibraryImportResult['bundleType'];
  skippedTracks: number;
  manifestFilePath: string;
  preparedTracks: NativeImportTrackPayload[];
  trackHashesToMarkInLibrary: string[];
  existingTrackAliases?: Record<string, string>;
  playlistCoverStagePaths: Record<string, string>;
};
