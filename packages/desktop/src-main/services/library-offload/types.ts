import type { TrackMetadataResult } from '../metadata-reader';

export type LibraryOffloadResult = string[] | TrackMetadataResult;

export type LibraryOffloadRequest =
  | {
      taskId: number;
      type: 'scan-directory';
      dirPath: string;
    }
  | {
      taskId: number;
      type: 'read-track-metadata';
      filePath: string;
      fileSize: number;
      artworkDir: string;
    };

export type LibraryOffloadResponse =
  | {
      taskId: number;
      ok: true;
      result: LibraryOffloadResult;
    }
  | {
      taskId: number;
      ok: false;
      error: string;
    };

export interface LibraryOffloadWorkerData {
  supportedExtensions: string[];
}
