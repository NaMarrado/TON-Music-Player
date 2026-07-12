import { Worker } from 'node:worker_threads';
import type { ExportManifest } from '@ton/core';
import type {
  ExportResult,
  PreparedArtworkFile,
  PreparedTrackFile,
  ProgressPayload,
} from '../handlers/export-import-handler/types';
import type {
  ExportImportOffloadRequest,
  ExportImportOffloadResult,
  ImportCopyResult,
  WorkerMessage,
} from './export-import-offload-types';
import { scheduleMainProcessJob } from './job-scheduler';

const EXPORT_IMPORT_OFFLOAD_WORKER_URL = new URL('./export-import-offload-worker-entry.js', import.meta.url);

function runOffthreadTask<T extends ExportImportOffloadResult>(
  request: ExportImportOffloadRequest,
  onProgress: (data: ProgressPayload) => void,
): Promise<T> {
  const kind = request.kind === 'import-copy' ? 'library-import' : 'library-export';

  return scheduleMainProcessJob<T>({
    kind,
    lane: 'archive-io',
    priority: 'user-blocking',
    onQueued: () => {
      onProgress({ phase: 'queued', current: 0, total: 1 });
    },
    run: () => new Promise<T>((resolve, reject) => {
      const worker = new Worker(EXPORT_IMPORT_OFFLOAD_WORKER_URL, { workerData: request });

      let settled = false;

      const cleanup = () => {
        worker.removeAllListeners();
        void worker.terminate();
      };

      worker.on('message', (message: WorkerMessage) => {
        if (message.type === 'progress') {
          onProgress(message.payload);
          return;
        }

        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        if (message.type === 'error') {
          reject(new Error(message.error));
          return;
        }

        resolve(message.result as T);
      });

      worker.on('error', (error) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      });

      worker.on('exit', (code) => {
        if (settled || code === 0) {
          return;
        }

        settled = true;
        reject(new Error(`Export/import offload worker exited with code ${code}`));
      });
    }),
  });
}

export function createExportArchiveOffthread(
  destinationPath: string,
  manifest: ExportManifest,
  trackFiles: PreparedTrackFile[],
  artworkFiles: PreparedArtworkFile[],
  onProgress: (data: ProgressPayload) => void,
): Promise<ExportResult> {
  return runOffthreadTask<ExportResult>(
    {
      kind: 'export-archive',
      destinationPath,
      manifest,
      trackFiles,
      artworkFiles,
    },
    onProgress,
  );
}

export function createExportFolderOffthread(
  destinationPath: string,
  manifest: ExportManifest,
  trackFiles: PreparedTrackFile[],
  artworkFiles: PreparedArtworkFile[],
  onProgress: (data: ProgressPayload) => void,
): Promise<ExportResult> {
  return runOffthreadTask<ExportResult>(
    {
      kind: 'export-folder',
      destinationPath,
      manifest,
      trackFiles,
      artworkFiles,
    },
    onProgress,
  );
}

export function copyImportDataOffthread(
  manifest: ExportManifest,
  tempDir: string,
  downloadDir: string,
  artworkDir: string,
  existingHashes: Set<string>,
  onProgress: (data: ProgressPayload) => void,
): Promise<ImportCopyResult> {
  return runOffthreadTask<ImportCopyResult>(
    {
      kind: 'import-copy',
      manifest,
      tempDir,
      downloadDir,
      artworkDir,
      existingHashes: [...existingHashes],
    },
    onProgress,
  );
}
