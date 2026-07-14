import {
  isSupportedLibraryArchiveName,
  INVALID_LIBRARY_ARCHIVE_ERROR,
  type LibraryImportSource,
  type LibraryImportResult,
  type LibraryTransferTask,
  type LibraryTransferProgress,
} from './shared';
import { canUseNativeLibraryTransfer, createLibraryTransferJobId } from './runtime';
import { isLibraryTransferCancelledError } from './cancellation';
import { acquireMobileJob } from '../job-scheduler';
import { startAndroidImportTask } from './import-android';
import { importMobileLibraryJs } from './import-js';

export async function beginImportMobileLibrary(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryImportResult>> {
  if (!isSupportedLibraryArchiveName(source.name)) {
    throw new Error(INVALID_LIBRARY_ARCHIVE_ERROR);
  }

  if (canUseNativeLibraryTransfer()) {
    return startAndroidImportTask(source, onProgress);
  }

  const jobId = createLibraryTransferJobId('library-import');
  const lease = acquireMobileJob({
    kind: 'library-import',
    lane: 'archive-io',
    priority: 'user-blocking',
    onQueued: () => {
      onProgress?.({ phase: 'queued', current: 0, total: 1 });
    },
  });
  let cancelRequested = false;
  let released = false;

  const releaseLease = () => {
    if (released) {
      return;
    }
    released = true;
    lease.release();
  };

  return {
    jobId,
    cancel: async () => {
      if (!lease.isActive()) {
        lease.cancelQueued();
        return;
      }

      cancelRequested = true;
    },
    result: (async () => {
      const started = await lease.started;
      if (!started) {
        return null;
      }

      try {
        return await importMobileLibraryJs(
          source,
          onProgress,
          () => cancelRequested,
        );
      } catch (error) {
        if (isLibraryTransferCancelledError(error)) {
          return null;
        }
        throw error;
      } finally {
        releaseLease();
      }
    })(),
  };
}

export async function importMobileLibrary(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryImportResult | null> {
  const task = await beginImportMobileLibrary(source, onProgress);
  return task.result;
}
