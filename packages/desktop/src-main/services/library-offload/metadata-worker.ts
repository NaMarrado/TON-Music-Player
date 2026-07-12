import { parentPort, workerData } from 'node:worker_threads';
import type {
  LibraryOffloadRequest,
  LibraryOffloadResponse,
  LibraryOffloadWorkerData,
} from './types';
import { readTrackMetadataInWorker } from './worker-tasks';

const activePort = parentPort;

if (!activePort) {
  throw new Error('Library metadata worker requires a parent port');
}

const workerPort = activePort;
void (workerData as LibraryOffloadWorkerData);

workerPort.on('message', (message: LibraryOffloadRequest) => {
  if (message.type !== 'read-track-metadata') {
    workerPort.postMessage({
      taskId: message.taskId,
      ok: false,
      error: `Unsupported task for metadata worker: ${message.type}`,
    } satisfies LibraryOffloadResponse);
    return;
  }

  void Promise.resolve(
    readTrackMetadataInWorker(message.filePath, message.fileSize, message.artworkDir),
  )
    .then((result) => {
      workerPort.postMessage({
        taskId: message.taskId,
        ok: true,
        result,
      } satisfies LibraryOffloadResponse);
    })
    .catch((error: unknown) => {
      workerPort.postMessage({
        taskId: message.taskId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies LibraryOffloadResponse);
    });
});
