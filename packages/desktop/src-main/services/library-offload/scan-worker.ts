import { parentPort, workerData } from 'node:worker_threads';
import type {
  LibraryOffloadRequest,
  LibraryOffloadResponse,
  LibraryOffloadWorkerData,
} from './types';
import { scanAudioDirectory } from './worker-tasks';

const activePort = parentPort;

if (!activePort) {
  throw new Error('Library scan worker requires a parent port');
}

const runtimeData = workerData as LibraryOffloadWorkerData;

activePort.on('message', (message: LibraryOffloadRequest) => {
  if (message.type !== 'scan-directory') {
    activePort.postMessage({
      taskId: message.taskId,
      ok: false,
      error: `Unsupported task for scan worker: ${message.type}`,
    } satisfies LibraryOffloadResponse);
    return;
  }

  void Promise.resolve(scanAudioDirectory(message.dirPath, runtimeData.supportedExtensions))
    .then((result) => {
      activePort.postMessage({
        taskId: message.taskId,
        ok: true,
        result,
      } satisfies LibraryOffloadResponse);
    })
    .catch((error: unknown) => {
      activePort.postMessage({
        taskId: message.taskId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies LibraryOffloadResponse);
    });
});
