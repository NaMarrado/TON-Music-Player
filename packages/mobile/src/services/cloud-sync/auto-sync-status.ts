import type { NetInfoState } from '@react-native-community/netinfo';
import {
  normalizeCloudStorageErrorKey,
  type CloudAutoSyncStatus,
  type CloudStorageConfig,
} from '@ton/core';
import { getMobileCloudConfig } from './config';
import {
  ensureMobileCloudScope,
  getMobileCloudPendingCount,
  getMobileCloudPersistedState,
  updateMobileCloudPersistedState,
} from './local-state';
import { mobileAutoSyncRuntime as runtime } from './auto-sync-state';

export function isOnline(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function isUnmetered(state: NetInfoState): boolean {
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  if (details?.isConnectionExpensive === true) return false;
  if (state.type === 'wifi' || state.type === 'ethernet') return true;
  return details?.isConnectionExpensive === false && state.type !== 'cellular';
}

export function publicStatus(): CloudAutoSyncStatus {
  if (runtime.baseStatus.state === 'idle'
      && runtime.baseStatus.pendingDownloads > 0
      && runtime.networkOnline && !runtime.unmeteredNetwork) {
    return { ...runtime.baseStatus, state: 'waiting-for-wifi' };
  }
  return { ...runtime.baseStatus };
}

export function emitStatus(): void {
  const status = publicStatus();
  runtime.listeners.forEach((listener) => listener(status));
}

export function classifyError(error: unknown): 'transient' | 'permanent' | 'cancelled' {
  if (runtime.currentController?.signal.aborted
      || (error instanceof Error && (
        error.name === 'AbortError'
        || error.message === 'cloud_sync_cancelled'
        || error.message === 'cloudAutoSyncDisabled'
        || error.message === 'cloudAutoSyncStopped'
      ))) return 'cancelled';
  if (error instanceof Error && (
    error.message === 'cloud_sync_invalid_v2_manifest'
    || error.message === 'cloud_sync_v2_manifest_missing'
    || error.message === 'cloud_sync_missing_etag'
  )) return 'permanent';
  const key = error instanceof Error ? normalizeCloudStorageErrorKey(error.message) : null;
  return key && key !== 'cloudStorageErrorConnectionFailed' ? 'permanent' : 'transient';
}

export function errorKey(error: unknown): string {
  if (!(error instanceof Error)) return 'cloudFailed';
  return normalizeCloudStorageErrorKey(error.message) ?? error.message ?? 'cloudFailed';
}

export function isPermanentStoredError(value: string | null): boolean {
  if (!value) return false;
  if (value === 'cloud_sync_invalid_v2_manifest'
      || value === 'cloud_sync_v2_manifest_missing'
      || value === 'cloud_sync_missing_etag'
      || value === 'cloudAutoSyncUnconfigured') return true;
  const normalized = normalizeCloudStorageErrorKey(value);
  return normalized != null && normalized !== 'cloudStorageErrorConnectionFailed';
}

export async function getConfiguredContext(): Promise<{
  config: CloudStorageConfig;
  scopeId: string;
}> {
  if (runtime.configuredContextCache) return runtime.configuredContextCache;
  const config = await getMobileCloudConfig();
  if (!config) throw new Error('cloudAutoSyncUnconfigured');
  runtime.configuredContextCache = { config, scopeId: await ensureMobileCloudScope(config) };
  return runtime.configuredContextCache;
}

export async function refreshPendingStatus(config?: CloudStorageConfig): Promise<{
  pendingChanges: number;
  pendingDownloads: number;
}> {
  if (!config) {
    const pendingChanges = await getMobileCloudPendingCount();
    runtime.coordinator?.setPendingCounts(pendingChanges, 0);
    return { pendingChanges, pendingDownloads: 0 };
  }
  const scopeId = await ensureMobileCloudScope(config);
  const [pendingChanges, state] = await Promise.all([
    getMobileCloudPendingCount(scopeId), getMobileCloudPersistedState(scopeId),
  ]);
  runtime.coordinator?.setPendingCounts(pendingChanges, state.pending_downloads);
  return { pendingChanges, pendingDownloads: state.pending_downloads };
}

export async function persistRuntimeStatus(
  status: CloudAutoSyncStatus,
  capturedScopeId: string | null,
): Promise<void> {
  let scopeId = capturedScopeId;
  if (!scopeId) {
    const config = await getMobileCloudConfig().catch(() => null);
    if (!config) return;
    scopeId = await ensureMobileCloudScope(config);
  }
  await updateMobileCloudPersistedState(scopeId, {
    last_success_at: status.lastSuccessAt == null ? undefined : Math.floor(status.lastSuccessAt / 1000),
    last_error: status.lastErrorKey,
    next_retry_at: status.nextRetryAt == null ? null : Math.floor(status.nextRetryAt / 1000),
  });
}
