import { SUPPORTED_AUDIO_EXTENSIONS } from '@ton/core';
import { Worker } from 'node:worker_threads';
import { scheduleMainProcessJob } from '../job-scheduler';
import type { TrackMetadataResult } from '../metadata-reader/types';
import { getArtworkDir } from '../metadata-reader/artwork';
import type {
  LibraryOffloadRequest,
  LibraryOffloadResponse,
  LibraryOffloadResult,
  LibraryOffloadWorkerData,
} from './types';

type PendingTask = {
  resolve: (value: LibraryOffloadResult) => void;
  reject: (reason?: unknown) => void;
};

const LIBRARY_SCAN_WORKER_URL = new URL('./library-scan-worker.js', import.meta.url);
const LIBRARY_METADATA_WORKER_URL = new URL('./library-metadata-worker.js', import.meta.url);
const METADATA_WORKER_COUNT = 2;

type MetadataWorkerSlot = {
  worker: Worker;
  pendingTasks: Map<number, PendingTask>;
  activeCount: number;
};

let scanWorker: Worker | null = null;
const scanPendingTasks = new Map<number, PendingTask>();
let metadataWorkers: MetadataWorkerSlot[] | null = null;
let nextTaskId = 1;

function rejectPendingTasks(pendingTasks: Map<number, PendingTask>, error: Error): void {
  for (const pending of pendingTasks.values()) {
    pending.reject(error);
  }
  pendingTasks.clear();
}

function createWorkerData(): LibraryOffloadWorkerData {
  return {
    supportedExtensions: [...(SUPPORTED_AUDIO_EXTENSIONS as readonly string[])],
  };
}

function ensureScanWorker(): Worker {
  if (scanWorker) {
    return scanWorker;
  }

  scanWorker = new Worker(LIBRARY_SCAN_WORKER_URL, {
    workerData: createWorkerData(),
  });

  scanWorker.on('message', (message: LibraryOffloadResponse) => {
    const pending = scanPendingTasks.get(message.taskId);
    if (!pending) {
      return;
    }

    scanPendingTasks.delete(message.taskId);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }

    pending.reject(new Error(message.error));
  });

  scanWorker.on('error', (error) => {
    scanWorker = null;
    rejectPendingTasks(scanPendingTasks, error instanceof Error ? error : new Error(String(error)));
  });

  scanWorker.on('exit', (code) => {
    scanWorker = null;
    if (code !== 0 && scanPendingTasks.size > 0) {
      rejectPendingTasks(scanPendingTasks, new Error(`Library scan worker exited with code ${code}`));
    }
  });

  return scanWorker;
}

function replaceMetadataWorkerSlot(index: number): void {
  if (!metadataWorkers) {
    return;
  }

  metadataWorkers[index] = createMetadataWorkerSlot(index);
}

function createMetadataWorkerSlot(index: number): MetadataWorkerSlot {
  const worker = new Worker(LIBRARY_METADATA_WORKER_URL, {
    workerData: createWorkerData(),
  });
  const slot: MetadataWorkerSlot = {
    worker,
    pendingTasks: new Map<number, PendingTask>(),
    activeCount: 0,
  };
  let hasBeenReplaced = false;

  worker.on('message', (message: LibraryOffloadResponse) => {
    const pending = slot.pendingTasks.get(message.taskId);
    if (!pending) {
      return;
    }

    slot.pendingTasks.delete(message.taskId);
    slot.activeCount = Math.max(0, slot.activeCount - 1);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }

    pending.reject(new Error(message.error));
  });

  worker.on('error', (error) => {
    const wrappedError = error instanceof Error ? error : new Error(String(error));
    rejectPendingTasks(slot.pendingTasks, wrappedError);
    slot.activeCount = 0;
    if (!hasBeenReplaced) {
      hasBeenReplaced = true;
      replaceMetadataWorkerSlot(index);
    }
  });

  worker.on('exit', (code) => {
    if (code !== 0 && slot.pendingTasks.size > 0) {
      rejectPendingTasks(slot.pendingTasks, new Error(`Library metadata worker exited with code ${code}`));
    }
    slot.activeCount = 0;
    if (code !== 0 && !hasBeenReplaced) {
      hasBeenReplaced = true;
      replaceMetadataWorkerSlot(index);
    }
  });

  return slot;
}

function ensureMetadataWorkers(): MetadataWorkerSlot[] {
  if (metadataWorkers) {
    return metadataWorkers;
  }

  metadataWorkers = Array.from(
    { length: METADATA_WORKER_COUNT },
    (_, index) => createMetadataWorkerSlot(index),
  );
  return metadataWorkers;
}

function runScanTask<T extends LibraryOffloadResult>(
  createRequest: (taskId: number) => LibraryOffloadRequest,
): Promise<T>;
function runScanTask<T extends LibraryOffloadResult>(
  createRequest: (taskId: number) => LibraryOffloadRequest,
): Promise<T> {
  const activeWorker = ensureScanWorker();
  const taskId = nextTaskId++;

  return new Promise<T>((resolve, reject) => {
    scanPendingTasks.set(taskId, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    activeWorker.postMessage(createRequest(taskId));
  });
}

export function scanDirectoryOffthread(dirPath: string): Promise<string[]> {
  return scheduleMainProcessJob({
    kind: 'library-scan',
    lane: 'cpu-heavy',
    priority: 'user-visible',
    run: () => runScanTask<string[]>((taskId) => ({
      taskId,
      type: 'scan-directory',
      dirPath,
    })),
  });
}

export function readTrackMetadataOffthread(
  filePath: string,
  fileSize: number,
): Promise<TrackMetadataResult> {
  return scheduleMainProcessJob({
    kind: 'track-metadata',
    lane: 'metadata',
    priority: 'background',
    run: () => {
      const workers = ensureMetadataWorkers();
      const slot = workers.reduce((best, current) => (
        current.activeCount < best.activeCount ? current : best
      ));
      const taskId = nextTaskId++;

      return new Promise<TrackMetadataResult>((resolve, reject) => {
        slot.pendingTasks.set(taskId, {
          resolve: (value) => resolve(value as TrackMetadataResult),
          reject,
        });
        slot.activeCount += 1;
        slot.worker.postMessage({
          taskId,
          type: 'read-track-metadata',
          filePath,
          fileSize,
          artworkDir: getArtworkDir(),
        } satisfies LibraryOffloadRequest);
      });
    },
  });
}

export async function disposeLibraryOffloadWorker(): Promise<void> {
  const activeScanWorker = scanWorker;
  scanWorker = null;
  if (activeScanWorker) {
    rejectPendingTasks(scanPendingTasks, new Error('Library scan worker disposed'));
    await activeScanWorker.terminate();
  }

  const activeMetadataWorkers = metadataWorkers;
  metadataWorkers = null;
  if (!activeMetadataWorkers) {
    return;
  }

  await Promise.all(activeMetadataWorkers.map(async (slot) => {
    rejectPendingTasks(slot.pendingTasks, new Error('Library metadata worker disposed'));
    await slot.worker.terminate();
  }));
}
