import {
  buildCloudV2ManifestObjectKey,
  type CloudSyncOrigin,
} from '@ton/core';
import {
  acquireMobileCloudLease,
  getMobileCloudOutbox,
  getMobileCloudPersistedState,
  releaseMobileCloudLease,
  renewMobileCloudLease,
  updateMobileCloudPersistedState,
} from './local-state';
import { MobileR2Client } from './r2-client';
import { mobileAutoSyncRuntime as runtime } from './auto-sync-state';
import {
  classifyError,
  errorKey,
  getConfiguredContext,
  refreshPendingStatus,
} from './auto-sync-status';
import { runMobileCloudV2Sync } from './v2-sync';

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
  try {
    const state = await getMobileCloudPersistedState(scopeId);
    const outbox = await getMobileCloudOutbox(scopeId);
    const manual = origin === 'manual' ? runtime.pendingManualRun : null;
    if (manual?.cancelled) throw new Error('cloud_sync_cancelled');
    const requestedMode = manual?.mode ?? 'sync';
    const mode = requestedMode === 'fetch' && outbox.length > 0 ? 'sync' : requestedMode;
    if (origin !== 'manual'
        && outbox.length === 0
        && state.needs_full_reconcile === 0
        && state.activation_marker_confirmed === 1
        && !((state.pending_downloads > 0 || state.pending_assets > 0)
          && runtime.unmeteredNetwork)
        && state.last_cleanup_at != null
        && Math.floor(Date.now() / 1000) - state.last_cleanup_at < 24 * 60 * 60) {
      const poll = await new MobileR2Client(config).getJsonConditional(
        buildCloudV2ManifestObjectKey(config.prefix), state.etag ?? undefined, controller.signal,
      );
      if (poll.status === 'not-modified') {
        return { pendingChanges: 0, pendingDownloads: state.pending_downloads };
      }
    }
    const result = await runMobileCloudV2Sync({
      config,
      mode,
      origin,
      allowAudioDownloads: origin === 'manual' || runtime.unmeteredNetwork,
      onProgress: manual?.onProgress,
      signal: controller.signal,
    });
    if (manual) manual.result = result;
    return refreshPendingStatus(config);
  } catch (error) {
    if (classifyError(error) !== 'cancelled' && !leaseLost) {
      await updateMobileCloudPersistedState(scopeId, { last_error: errorKey(error) }).catch(() => {});
    }
    throw error;
  } finally {
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
  const cycle = runCycle(origin);
  const tracked = cycle.finally(() => {
    if (runtime.activeCyclePromise === tracked) runtime.activeCyclePromise = null;
  });
  runtime.activeCyclePromise = tracked;
  return tracked;
}

export async function runBackgroundCycle(): Promise<void> {
  await runCycle('background');
}
