import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { LibraryTransferProgress, LibraryTransferTask } from './library-transfer/types';

const LIBRARY_TRANSFER_EVENT = 'libraryTransfer:event';

export type AndroidLibraryImportRequest = {
  jobId: string;
  sourceUri: string;
  sourceName: string;
  existingHashes: string[];
};

export type AndroidLibraryExportRequest = {
  jobId: string;
  outputUri: string;
  fileName: string;
  bundleType: string;
  manifestJson: string;
  trackFiles: Array<{ filePath: string; archivePath: string }>;
  artworkFiles: Array<{ filePath: string; archivePath: string }>;
  trackCount: number;
  playlistCount: number;
  sizeBytes: number;
};

type AndroidLibraryTransferModule = {
  copyExportFile(sourceUri: string, destinationUri: string): Promise<void>;
  pickExportDestination(fileName: string): Promise<string | null>;
  startImport(request: AndroidLibraryImportRequest): Promise<string>;
  startExport(request: AndroidLibraryExportRequest): Promise<string>;
  cancel(jobId: string): Promise<void>;
};

type TransferEvent = {
  jobId: string;
  state: 'progress' | 'completed' | 'failed' | 'cancelled';
  phase?: LibraryTransferProgress['phase'];
  current?: number;
  total?: number;
  resultJson?: string;
  error?: string;
};

type PendingTask = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (progress: LibraryTransferProgress) => void;
};

let subscription: { remove: () => void } | null = null;
const pendingTasks = new Map<string, PendingTask>();

function getModule(): AndroidLibraryTransferModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  return NativeModules.AndroidLibraryTransfer as AndroidLibraryTransferModule | undefined ?? null;
}

function ensureSubscription(): void {
  const module = getModule();
  if (!module || subscription) {
    return;
  }

  const emitter = new NativeEventEmitter(module as never);
  subscription = emitter.addListener(LIBRARY_TRANSFER_EVENT, (event: TransferEvent) => {
    const pending = pendingTasks.get(event.jobId);
    if (!pending) {
      return;
    }

    if (event.state === 'progress') {
      pending.onProgress?.({
        phase: event.phase ?? 'preparing',
        current: typeof event.current === 'number' ? event.current : 0,
        total: typeof event.total === 'number' ? event.total : 1,
      });
      return;
    }

    pendingTasks.delete(event.jobId);
    if (event.state === 'completed') {
      pending.resolve(event.resultJson ? JSON.parse(event.resultJson) : null);
      return;
    }

    if (event.state === 'cancelled') {
      pending.resolve(null);
      return;
    }

    pending.reject(new Error(event.error ?? 'Library transfer failed'));
  });
}

function createTask<Result>(
  jobId: string,
  onProgress?: (progress: LibraryTransferProgress) => void,
): LibraryTransferTask<Result> {
  const result = new Promise<Result | null>((resolve, reject) => {
    pendingTasks.set(jobId, {
      resolve: resolve as (value: unknown) => void,
      reject,
      onProgress,
    });
  });

  return {
    jobId,
    cancel: async () => {
      const module = getModule();
      if (!module) {
        return;
      }

      await module.cancel(jobId);
    },
    result,
  };
}

export function createAndroidLibraryTransferJobId(prefix = 'library-transfer'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isAndroidLibraryTransferAvailable(): boolean {
  return getModule() != null;
}

export async function copyAndroidLibraryExportFile(
  sourceUri: string,
  destinationUri: string,
): Promise<void> {
  const module = getModule();
  if (!module?.copyExportFile) {
    throw new Error('Android library file export is unavailable');
  }
  await module.copyExportFile(sourceUri, destinationUri);
}

export async function pickAndroidLibraryExportDestination(fileName: string): Promise<string | null> {
  const module = getModule();
  if (!module) {
    throw new Error('Android library transfer module is unavailable');
  }

  return module.pickExportDestination(fileName);
}

export async function startAndroidLibraryImport<Result>(
  request: AndroidLibraryImportRequest,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<Result>> {
  const module = getModule();
  if (!module) {
    throw new Error('Android library transfer module is unavailable');
  }

  ensureSubscription();
  const task = createTask<Result>(request.jobId, onProgress);
  try {
    await module.startImport(request);
    return task;
  } catch (error) {
    pendingTasks.delete(request.jobId);
    throw error;
  }
}

export async function startAndroidLibraryExport<Result>(
  request: AndroidLibraryExportRequest,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<Result>> {
  const module = getModule();
  if (!module) {
    throw new Error('Android library transfer module is unavailable');
  }

  ensureSubscription();
  const task = createTask<Result>(request.jobId, onProgress);
  try {
    await module.startExport(request);
    return task;
  } catch (error) {
    pendingTasks.delete(request.jobId);
    throw error;
  }
}
