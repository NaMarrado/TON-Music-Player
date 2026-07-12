import { parentPort, workerData } from 'node:worker_threads';
import type {
  LibraryOffloadRequest,
  LibraryOffloadResponse,
  LibraryOffloadWorkerData,
} from './types';
import { readTrackMetadataInWorker, scanAudioDirectory } from './worker-tasks';

const activePort = parentPort;

if (!activePort) {
  throw new Error('Library offload worker requires a parent port');
}

const runtimeData = workerData as LibraryOffloadWorkerData;

async function runTask(message: LibraryOffloadRequest): Promise<string[] | Awaited<ReturnType<typeof readTrackMetadataInWorker>>> {
  if (message.type === 'scan-directory') {
    return scanAudioDirectory(message.dirPath, runtimeData.supportedExtensions);
  }

  return readTrackMetadataInWorker(message.filePath, message.fileSize, message.artworkDir);
}

activePort.on('message', (message: LibraryOffloadRequest) => {
  void Promise.resolve(runTask(message))
    .then((result) => {
      activePort.postMessage({
        taskId: message.taskId,
        ok: true,
        result,
      } satisfies LibraryOffloadResponse);
    })
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      activePort.postMessage({
        taskId: message.taskId,
        ok: false,
        error: errorMessage,
      } satisfies LibraryOffloadResponse);
    });
});
