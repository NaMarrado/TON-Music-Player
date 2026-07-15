import { ensureMusicDir } from '../downloader/filesystem';
import { getAllTrackIdsByHash } from '../db-queries';
import { acquireMobileJob } from '../job-scheduler';
import type { LibraryImportSource, LibraryImportResult, LibraryTransferProgress, LibraryTransferTask } from './shared';
import { createLibraryTransferJobId, startNativeLibraryImportTask } from './runtime';
import { finalizeAndroidImportResult } from './import-android-finalize';
import type { NativeImportResult } from './import-types';

export async function startAndroidImportTask(
  source: LibraryImportSource,
  onProgress?: (progress: LibraryTransferProgress) => void,
): Promise<LibraryTransferTask<LibraryImportResult>> {
  const jobId = createLibraryTransferJobId('library-import');
  const lease = acquireMobileJob({
    kind: 'library-import',
    lane: 'archive-io',
    priority: 'user-blocking',
    onQueued: () => onProgress?.({ phase: 'queued', current: 0, total: 1 }),
  });
  let nativeTask: LibraryTransferTask<NativeImportResult> | null = null;
  let cancelRequested = false;
  let released = false;
  const releaseLease = () => {
    if (!released) {
      released = true;
      lease.release();
    }
  };

  return {
    jobId,
    cancel: async () => {
      if (!lease.isActive()) {
        lease.cancelQueued();
      } else if (nativeTask) {
        await nativeTask.cancel();
      } else {
        cancelRequested = true;
      }
    },
    result: (async () => {
      const started = await lease.started;
      if (!started) return null;

      try {
        onProgress?.({ phase: 'preparing', current: 0, total: 1 });
        await ensureMusicDir();
        const existingTrackIdsByHash = await getAllTrackIdsByHash();
        if (cancelRequested) return null;

        nativeTask = await startNativeLibraryImportTask<NativeImportResult>({
          jobId,
          sourceUri: source.uri,
          sourceName: source.name,
          existingHashes: Object.keys(existingTrackIdsByHash),
        }, onProgress);
        if (cancelRequested) await nativeTask.cancel();
        const nativeResult = await nativeTask.result;
        return nativeResult
          ? finalizeAndroidImportResult(source.name, nativeResult, existingTrackIdsByHash, onProgress)
          : null;
      } finally {
        releaseLease();
      }
    })(),
  };
}
