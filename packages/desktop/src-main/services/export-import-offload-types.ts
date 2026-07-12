import type { ExportManifest } from '@ton/core';
import type {
  ExportResult,
  ImportPreparedFile,
  PreparedArtworkFile,
  PreparedTrackFile,
  ProgressPayload,
} from '../handlers/export-import-handler/types';

export type ExportArchiveRequest = {
  kind: 'export-archive';
  destinationPath: string;
  manifest: ExportManifest;
  trackFiles: PreparedTrackFile[];
  artworkFiles: PreparedArtworkFile[];
};

export type ExportFolderRequest = {
  kind: 'export-folder';
  destinationPath: string;
  manifest: ExportManifest;
  trackFiles: PreparedTrackFile[];
  artworkFiles: PreparedArtworkFile[];
};

export type ImportCopyRequest = {
  kind: 'import-copy';
  manifest: ExportManifest;
  tempDir: string;
  downloadDir: string;
  artworkDir: string;
  existingHashes: string[];
};

export type ExportImportOffloadRequest =
  | ExportArchiveRequest
  | ExportFolderRequest
  | ImportCopyRequest;

export type ImportCopyResult = {
  filesToInsert: ImportPreparedFile[];
  importedTracks: number;
  playlistCoverPaths: Record<string, string>;
  skippedTracks: number;
};

export type ExportImportOffloadResult = ExportResult | ImportCopyResult;

export type WorkerProgressMessage = {
  type: 'progress';
  payload: ProgressPayload;
};

export type WorkerResultMessage = {
  type: 'result';
  result: ExportImportOffloadResult;
};

export type WorkerErrorMessage = {
  type: 'error';
  error: string;
};

export type WorkerMessage = WorkerProgressMessage | WorkerResultMessage | WorkerErrorMessage;
