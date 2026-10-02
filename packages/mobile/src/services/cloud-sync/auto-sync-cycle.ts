import type { CloudSyncProgress, CloudSyncOrigin } from '@ton/core';
import {
  acquireMobileCloudLease,
  releaseMobileCloudLease,
  renewMobileCloudLease,
  updateMobileCloudPersistedState,
} from './local-state';
import { mobileAutoSyncRuntime as runtime } from './auto-sync-state';
import {
  classifyError,
  emitStatus,
  errorKey,
  getConfiguredContext,
  refreshPendingStatus,
} from './auto-sync-status';
import { runMobileCloudV2Sync } from './v2-sync';

const CLOUD_PROGRESS_UI_INTERVAL_MS = 125;

async function runCycle(origin: CloudSyncOrigin): Promise<{
  pendingChanges: number;
  pendingDownloads: number;
}> {
  const { config, scopeId } = await getConfiguredContext();
  const owner = `${origin}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (!(await acquireMobileCloudLease(owner, origin === 'background' ? 60 : 300))) {
    return refreshPendingStatus(config);
  }
  const controller = new AbortController();
  runtime.currentController = controller;
  let leaseLost = false;
  const leaseHeartbeat = origin === 'background' ? null : setInterval(() => {
    void renewMobileCloudLease(owner, 300).then((renewed) => {
      if (!renewed) {
        leaseLost = true;
        controller.abort();
      }
    }).catch(() => {
      leaseLost = true;
      controller.abort();
    });
  }, 60_000);
  const backgroundDeadline = origin === 'background'
    ? setTimeout(() => controller.abort(), 25_000)
    : null;
  let progressTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingProgress: CloudSyncProgress | null = null;
  let lastProgressAt = 0;
  const publishProgress = (progress: CloudSyncProgress) => {
    runtime.currentProgress = progress;
    runtime.pendingManualRun?.onProgress?.(progress);
    emitStatus();
    lastProgressAt = Date.now();
  };
  const reportProgress = (progress: CloudSyncProgress) => {
    pendingProgress = progress;
    const terminal = progress.phase === 'done'
      || progress.phase === 'failed'
      || progress.phase === 'cancelled';
    const elapsed = Date.now() - lastProgressAt;
    if (terminal || elapsed >= CLOUD_PROGRESS_UI_INTERVAL_MS) {
      if (progressTimer) clearTimeout(progressTimer);
      progressTimer = null;
      pendingProgress = null;
      publishProgress(progress);
      return;
    }
    if (!progressTimer) {
      progressTimer = setTimeout(() => {
        progressTimer = null;
        const next = pendingProgress;
        pendingProgress = null;
        if (next) publishProgress(next);
      }, CLOUD_PROGRESS_UI_INTERVAL_MS - elapsed);
    }
  };
  try {
    const manual = origin === 'manual' ? runtime.pendingManualRun : null;
    if (manual?.cancelled) throw new Error('cloud_sync_cancelled');
    // Automatic runs merge safe local upserts and remote changes. Track delete
    // triggers intentionally do not create outbox rows, so destructive cloud
    // cleanup remains an explicit user action.
    const requestedMode = manual?.mode ?? 'sync';
    const onProgress = reportProgress;
    const mode = requestedMode;
    const result = await runMobileCloudV2Sync({
      config,
      mode,
      origin,
      allowAudioDownloads: runtime.unmeteredNetwork || runtime.audioOverCellular,
      onProgress,
      signal: controller.signal,
      restoreLocallyDeleted: Boolean(manual?.restoreLocallyDeleted),
    });
    if (manual) manual.result = result;
    return refreshPendingStatus(config);
  } catch (error) {
    if (classifyError(error) !== 'cancelled') {
      runtime.currentProgress = {
        ...(runtime.currentProgress ?? {
          current: 0, total: 0, uploaded: 0, downloaded: 0, skipped: 0, failed: 0,
        }),
        phase: 'failed',
        failed: Math.max(1, runtime.currentProgress?.failed ?? 0),
      };
      emitStatus();
    }
    if (classifyError(error) !== 'cancelled' && !leaseLost) {
      await updateMobileCloudPersistedState(scopeId, { last_error: errorKey(error) }).catch(() => {});
    }
    throw error;
  } finally {
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = null;
    if (pendingProgress) publishProgress(pendingProgress);
    pendingProgress = null;
    if (backgroundDeadline) clearTimeout(backgroundDeadline);
    if (leaseHeartbeat) clearInterval(leaseHeartbeat);
    if (runtime.currentController === controller) runtime.currentController = null;
    await releaseMobileCloudLease(owner).catch(() => {});
  }
}

export function runTrackedCycle(origin: CloudSyncOrigin): Promise<{
  pendingChanges: number;
  pendingDownloads: number;
}> {
  if (runtime.activeCyclePromise) return runtime.activeCyclePromise;
  const cycle = runCycle(origin);
  const tracked = cycle.finally(() => {
    if (runtime.activeCyclePromise === tracked) runtime.activeCyclePromise = null;
  });
  runtime.activeCyclePromise = tracked;
  return tracked;
}

export async function runBackgroundCycle(): Promise<void> {
  await runTrackedCycle('background');
}
