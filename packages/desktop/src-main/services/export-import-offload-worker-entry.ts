import { parentPort, workerData } from 'node:worker_threads';
import type { ProgressPayload } from '../handlers/export-import-handler/types';
import { createExportArchive, createExportFolder } from './export-import-archive-tasks';
import { copyImportData } from './export-import-copy-task';
import { createMetadataArchive } from './export-import-metadata-archive-task';
import type {
  ExportImportOffloadRequest,
  ExportImportOffloadResult,
  WorkerErrorMessage,
  WorkerResultMessage,
} from './export-import-offload-types';

const activePort = parentPort;

if (!activePort) {
  throw new Error('Export/import worker requires a parent port');
}

const workerPort = activePort;
const request = workerData as ExportImportOffloadRequest;

function sendProgress(payload: ProgressPayload): void {
  workerPort.postMessage({ type: 'progress', payload });
}

async function runTask(currentRequest: ExportImportOffloadRequest): Promise<ExportImportOffloadResult> {
  if (currentRequest.kind === 'export-archive') {
    return createExportArchive(
      currentRequest.destinationPath,
      currentRequest.manifest,
      currentRequest.trackFiles,
      currentRequest.artworkFiles,
      sendProgress,
    );
  }

  if (currentRequest.kind === 'export-folder') {
    return createExportFolder(
      currentRequest.destinationPath,
      currentRequest.manifest,
      currentRequest.trackFiles,
      currentRequest.artworkFiles,
      sendProgress,
    );
  }

  if (currentRequest.kind === 'playlist-archive') {
    return createMetadataArchive(
      currentRequest.destinationPath,
      currentRequest.tracks,
      currentRequest.playlist,
      sendProgress,
    );
  }

  return copyImportData(
    currentRequest.manifest,
    currentRequest.tempDir,
    currentRequest.downloadDir,
    currentRequest.artworkDir,
    currentRequest.existingHashes,
    sendProgress,
  );
}

void Promise.resolve(runTask(request))
  .then((result) => {
    workerPort.postMessage({ type: 'result', result } satisfies WorkerResultMessage);
  })
  .catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    workerPort.postMessage({ type: 'error', error: errorMessage } satisfies WorkerErrorMessage);
  });
