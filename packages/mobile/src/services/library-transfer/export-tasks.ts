import { acquireMobileJob } from '../job-scheduler';
import { pickAndroidLibraryExportDestination } from '../native-library-transfer';
import type {
  LibraryExportResult,
  LibraryExportSelection,
  LibraryTransferProgress,
  LibraryTransferTask,
} from './shared';
import { isLibraryTransferCancelledError } from './cancellation';
import { buildExportPayload } from './export-payload';
import { exportMobileLibraryJs } from './export-js';
import { createLibraryTransferJobId, startNativeLibraryExportTask } from './runtime';

function createExportLease(onProgress?: (progress: LibraryTransferProgress) => void) {
  return acquireMobileJob({
    kind: 'library-export',
    lane: 'archive-io',
    priority: 'user-blocking',
    onQueued: () => onProgress?.({ phase: 'queued', current: 0, total: 1 }),
  });
}

export async function startJsExportTask(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryExportResult>> {
  const jobId = createLibraryTransferJobId('library-export');
  const lease = createExportLease(onProgress);
  let cancelRequested = false;
  return {
    jobId,
    cancel: async () => {
      if (!lease.isActive()) lease.cancelQueued();
      else cancelRequested = true;
    },
    result: (async () => {
      const started = await lease.started;
      if (!started) return null;
      try {
        return await exportMobileLibraryJs(selection, onProgress, () => cancelRequested);
      } catch (error) {
        if (isLibraryTransferCancelledError(error)) return null;
        throw error;
      } finally {
        lease.release();
      }
    })(),
  };
}

export async function startAndroidExportTask(
  selection: LibraryExportSelection,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryExportResult>> {
  const jobId = createLibraryTransferJobId('library-export');
  const lease = createExportLease(onProgress);
  let nativeTask: LibraryTransferTask<LibraryExportResult> | null = null;
  let cancelRequested = false;
  return {
    jobId,
    cancel: async () => {
      if (!lease.isActive()) lease.cancelQueued();
      else if (nativeTask) await nativeTask.cancel();
      else cancelRequested = true;
    },
    result: (async () => {
      const started = await lease.started;
      if (!started) return null;
      try {
        onProgress?.({ phase: 'preparing', current: 0, total: 1 });
        const payload = await buildExportPayload(selection, onProgress, () => cancelRequested);
        if (cancelRequested) return null;
        const outputUri = await pickAndroidLibraryExportDestination(payload.exportFileName);
        if (!outputUri || cancelRequested) return null;
        nativeTask = await startNativeLibraryExportTask<LibraryExportResult>({
          jobId,
          outputUri,
          fileName: payload.exportFileName,
          bundleType: payload.bundleType,
          manifestJson: JSON.stringify(payload.manifest),
          trackFiles: payload.trackFiles,
          artworkFiles: payload.artworkFiles,
          trackCount: payload.trackCount,
          playlistCount: payload.playlistCount,
          sizeBytes: payload.sizeBytes,
        }, onProgress);
        if (cancelRequested) await nativeTask.cancel();
        return nativeTask.result;
      } catch (error) {
        if (isLibraryTransferCancelledError(error)) return null;
        throw error;
      } finally {
        lease.release();
      }
    })(),
  };
}
