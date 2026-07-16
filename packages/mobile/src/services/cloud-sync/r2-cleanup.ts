import type {
  CloudLibraryManifestV2,
  CloudR2CleanupPlan,
  CloudR2CleanupPreview,
  CloudR2CleanupResult,
  CloudSyncProgress,
} from '@ton/core';
import {
  buildCloudR2CleanupPlan,
  buildCloudV2CommitObjectKey,
  buildCloudV2ManifestObjectKey,
  executeCloudR2CleanupPlan,
  normalizeCloudPrefix,
  parseCloudLibraryManifestV2,
} from '@ton/core';
import { getAllTracksForTransfer } from '../db-queries';
import {
  getMobileCloudDeviceId,
  setMobileCloudLastRevision,
} from './config';
import {
  acquireMobileCloudLease,
  ensureMobileCloudScope,
  getMobileCloudJournalGeneration,
  releaseMobileCloudLease,
  updateMobileCloudPersistedState,
} from './local-state';
import { mobileAutoSyncRuntime as runtime } from './auto-sync-state';
import { getConfiguredContext } from './auto-sync-status';
import { ensureTrackContentHash } from './v1-common';
import { storeEntityMirror } from './v2-mirror';
import { MobileR2Client, MobileR2PreconditionFailedError } from './r2-client';
import {
  clearMobileCloudDownloadFailures,
  listMobileCloudDownloadFailures,
} from './download-failures';

type ProgressCallback = (progress: CloudSyncProgress) => void;

const cachedPlans = new Map<string, CloudR2CleanupPlan>();

function emitProgress(
  callback: ProgressCallback | undefined,
  patch: Partial<CloudSyncProgress>,
): void {
  callback?.({
    phase: 'analyzing-cleanup', current: 0, total: 0,
    uploaded: 0, downloaded: 0, skipped: 0, failed: 0,
    ...patch,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('cloud_sync_cancelled');
}

async function collectLocalHashes(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<string[]> {
  const tracks = await getAllTracksForTransfer();
  const hashes = new Set<string>();
  emitProgress(onProgress, { phase: 'analyzing-cleanup', total: tracks.length });
  for (let index = 0; index < tracks.length; index += 1) {
    throwIfAborted(signal);
    const hash = await ensureTrackContentHash(tracks[index]);
    if (!hash) throw new Error('cloud_cleanup_local_file_unreadable');
    hashes.add(hash.toLowerCase());
    emitProgress(onProgress, {
      phase: 'analyzing-cleanup', current: index + 1, total: tracks.length,
    });
  }
  return [...hashes];
}

async function buildCurrentPlan(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<CloudR2CleanupPlan> {
  const { config, scopeId } = await getConfiguredContext();
  const client = new MobileR2Client(config);
  const localHashes = await collectLocalHashes(onProgress, signal);
  throwIfAborted(signal);
  const read = await client.getJsonConditional<CloudLibraryManifestV2>(
    buildCloudV2ManifestObjectKey(config.prefix), undefined, signal,
  );
  const manifest = read.status === 'ok' ? parseCloudLibraryManifestV2(read.value) : null;
  if (!manifest || read.status !== 'ok' || !read.etag) {
    throw new Error('cloud_cleanup_manifest_missing');
  }
  const [objects, failures] = await Promise.all([
    client.listObjects(`${normalizeCloudPrefix(config.prefix)}/`, signal),
    listMobileCloudDownloadFailures(scopeId),
  ]);
  throwIfAborted(signal);
  return buildCloudR2CleanupPlan({
    manifest,
    manifestEtag: read.etag,
    storageScope: [
      config.accountId,
      config.bucket,
      config.jurisdiction,
      normalizeCloudPrefix(config.prefix),
    ].join('\n'),
    localHashes,
    objects,
    prefix: config.prefix,
    deviceId: await getMobileCloudDeviceId(),
    failures,
  });
}

async function staleResult(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<CloudR2CleanupResult> {
  const refreshed = await buildCurrentPlan(onProgress, signal);
  cachedPlans.clear();
  cachedPlans.set(refreshed.preview.previewToken, refreshed);
  return {
    status: 'stale', deletedTracks: 0, updatedPlaylists: 0,
    deletedObjects: 0, failedObjects: 0, freedBytes: 0, revision: null,
    refreshedPreview: refreshed.preview,
  };
}

export async function previewCloudCleanup(
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<CloudR2CleanupPreview> {
  const plan = await buildCurrentPlan(onProgress, signal);
  cachedPlans.clear();
  cachedPlans.set(plan.preview.previewToken, plan);
  return plan.preview;
}

async function acquireCleanupLease(owner: string, signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    throwIfAborted(signal);
    if (await acquireMobileCloudLease(owner, 300)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('cloud_cleanup_busy');
}

export async function executeCloudCleanup(
  previewToken: string,
  onProgress?: ProgressCallback,
): Promise<CloudR2CleanupResult> {
  runtime.currentController?.abort();
  runtime.coordinator?.cancelActive();
  await runtime.activeCyclePromise?.catch(() => undefined);
  const controller = new AbortController();
  runtime.currentController = controller;
  const owner = `cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let leaseAcquired = false;
  try {
    await acquireCleanupLease(owner, controller.signal);
    leaseAcquired = true;
    const expected = cachedPlans.get(previewToken);
    const current = await buildCurrentPlan(onProgress, controller.signal);
    if (!expected || current.preview.previewToken !== previewToken) {
      cachedPlans.clear();
      cachedPlans.set(current.preview.previewToken, current);
      return {
        status: 'stale', deletedTracks: 0, updatedPlaylists: 0,
        deletedObjects: 0, failedObjects: 0, freedBytes: 0, revision: null,
        refreshedPreview: current.preview,
      };
    }
    const { config } = await getConfiguredContext();
    const scopeId = await ensureMobileCloudScope(config);
    const client = new MobileR2Client(config);
    emitProgress(onProgress, { phase: 'cleaning', total: current.objectKeysToDelete.length });
    const result = await executeCloudR2CleanupPlan(current, {
      publishManifest: async (plan, signal) => {
        try {
          const write = await client.putJsonConditional(
            buildCloudV2ManifestObjectKey(config.prefix),
            plan.manifest,
            { ifMatch: plan.manifestEtag, signal },
          );
          if (write.etag) return { status: 'ok', etag: write.etag };
        } catch (error) {
          if (error instanceof MobileR2PreconditionFailedError) return { status: 'stale' };
          throw error;
        }
        const verified = await client.getJsonConditional<CloudLibraryManifestV2>(
          buildCloudV2ManifestObjectKey(config.prefix), undefined, signal,
        );
        if (verified.status !== 'ok' || !verified.etag) throw new Error('cloud_sync_missing_etag');
        return { status: 'ok', etag: verified.etag };
      },
      commitLocalState: async (plan, etag, signal) => {
        const generation = await getMobileCloudJournalGeneration();
        await storeEntityMirror(scopeId, plan.manifest, generation, signal);
        await updateMobileCloudPersistedState(scopeId, {
          revision: plan.manifest.revision,
          etag,
          lamport_counter: plan.manifest.max_counter,
          last_success_at: Math.floor(Date.now() / 1000),
          last_error: null,
          next_retry_at: null,
        });
        await setMobileCloudLastRevision(plan.manifest.revision);
        await clearMobileCloudDownloadFailures(
          scopeId,
          plan.preview.failuresToClear.map((failure) => failure.contentHash),
        );
      },
      writeCommit: (plan, signal) => client.putJson(
        buildCloudV2CommitObjectKey(config.prefix, plan.manifest.revision),
        plan.manifest,
        signal,
      ),
      deleteObject: (key, signal) => client.deleteObject(key, signal),
    }, { signal: controller.signal, onProgress });

    if (result.status === 'stale') {
      return staleResult(onProgress, controller.signal);
    }
    cachedPlans.clear();
    return result;
  } finally {
    if (leaseAcquired) await releaseMobileCloudLease(owner).catch(() => undefined);
    if (runtime.currentController === controller) runtime.currentController = null;
    void runtime.coordinator?.runNow('auto').catch(() => undefined);
  }
}
