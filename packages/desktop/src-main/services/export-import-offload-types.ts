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

export type MetadataArchiveTrack = {
  file_path: string;
  cover_art_path: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
};

export type PlaylistArchiveRequest = {
  kind: 'playlist-archive';
  destinationPath: string;
  playlist: {
    name: string;
    cover_path: string | null;
  };
  tracks: MetadataArchiveTrack[];
};

export type ExportImportOffloadRequest =
  | ExportArchiveRequest
  | ExportFolderRequest
  | ImportCopyRequest
  | PlaylistArchiveRequest;

export type ImportCopyResult = {
  filesToInsert: ImportPreparedFile[];
  importedTracks: number;
  skippedTracks: number;
};

export type ArchiveFileResult = {
  filePath: string;
};

export type ExportImportOffloadResult = ExportResult | ImportCopyResult | ArchiveFileResult;

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
