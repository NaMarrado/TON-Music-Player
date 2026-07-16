import type {
  CloudR2CleanupResult,
  CloudSyncProgress,
} from '../../types/cloud-sync';
import type { CloudR2CleanupPlan } from './r2-cleanup';

export interface CloudR2CleanupAbortSignal {
  readonly aborted: boolean;
}

export interface CloudR2CleanupExecutionAdapter<
  TSignal extends CloudR2CleanupAbortSignal = CloudR2CleanupAbortSignal,
> {
  publishManifest: (
    plan: CloudR2CleanupPlan,
    signal?: TSignal,
  ) => Promise<{ status: 'ok'; etag: string } | { status: 'stale' }>;
  commitLocalState: (
    plan: CloudR2CleanupPlan,
    etag: string,
    signal?: TSignal,
  ) => Promise<void>;
  writeCommit?: (plan: CloudR2CleanupPlan, signal?: TSignal) => Promise<void>;
  deleteObject: (key: string, signal?: TSignal) => Promise<void>;
}

export interface CloudR2CleanupExecutionOptions<
  TSignal extends CloudR2CleanupAbortSignal = CloudR2CleanupAbortSignal,
> {
  signal?: TSignal;
  onProgress?: (progress: CloudSyncProgress) => void;
}

export async function executeCloudR2CleanupPlan<
  TSignal extends CloudR2CleanupAbortSignal = CloudR2CleanupAbortSignal,
>(
  plan: CloudR2CleanupPlan,
  adapter: CloudR2CleanupExecutionAdapter<TSignal>,
  options: CloudR2CleanupExecutionOptions<TSignal> = {},
): Promise<CloudR2CleanupResult> {
  throwIfAborted(options.signal);
  const publication = await adapter.publishManifest(plan, options.signal);
  if (publication.status === 'stale') {
    return emptyResult('stale');
  }

  // Once CAS succeeds, local metadata must catch up even if the user cancels immediately.
  await adapter.commitLocalState(plan, publication.etag);
  if (adapter.writeCommit) {
    await adapter.writeCommit(plan).catch(() => undefined);
  }

  let deletedObjects = 0;
  let failedObjects = 0;
  let freedBytes = 0;
  for (let index = 0; index < plan.objectKeysToDelete.length; index += 1) {
    throwIfAborted(options.signal);
    const key = plan.objectKeysToDelete[index];
    try {
      await adapter.deleteObject(key, options.signal);
      deletedObjects += 1;
      freedBytes += plan.objectSizeByKey.get(key) ?? 0;
    } catch (error) {
      throwIfAborted(options.signal);
      failedObjects += 1;
    }
    options.onProgress?.({
      phase: 'cleaning',
      current: index + 1,
      total: plan.objectKeysToDelete.length,
      uploaded: 0,
      downloaded: 0,
      skipped: 0,
      failed: failedObjects,
    });
  }

  return {
    status: 'completed',
    deletedTracks: plan.preview.cloudOnlyTracks,
    updatedPlaylists: plan.preview.affectedPlaylists,
    deletedObjects,
    failedObjects,
    freedBytes,
    revision: plan.manifest.revision,
  };
}

function throwIfAborted(signal?: CloudR2CleanupAbortSignal): void {
  if (signal?.aborted) throw new Error('cloud_sync_cancelled');
}

function emptyResult(status: 'stale'): CloudR2CleanupResult {
  return {
    status,
    deletedTracks: 0,
    updatedPlaylists: 0,
    deletedObjects: 0,
    failedObjects: 0,
    freedBytes: 0,
    revision: null,
  };
}
