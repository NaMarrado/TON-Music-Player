import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import type {
  CloudAutoSyncStatus,
  CloudSyncProgress,
  CloudSyncResult,
} from '@ton/core';
import {
  getMobileCloudAutoSyncEnabled,
  getMobileCloudAudioOverCellularEnabled,
  getMobileCloudConfig,
  setMobileCloudAutoSyncEnabled as persistMobileCloudAutoSyncEnabled,
  setMobileCloudAudioOverCellularEnabled as persistMobileCloudAudioOverCellularEnabled,
} from './config';
import {
  ensureMobileCloudScope,
  getMobileCloudPendingCount,
  getMobileCloudPersistedState,
  recoverMobileCloudControl,
  updateMobileCloudPersistedState,
} from './local-state';
import {
  registerMobileCloudBackgroundTask,
  unregisterMobileCloudBackgroundTask,
} from './background-registration';
import { runBackgroundCycle } from './auto-sync-cycle';
import {
  applyNetworkState,
  createCoordinator,
  startForegroundCoordinator,
  startJournalObserver,
  stopForegroundCoordinator,
  stopJournalObserver,
} from './auto-sync-coordinator';
import { mobileAutoSyncRuntime as runtime, type PendingManualRun, type StatusListener } from './auto-sync-state';
import {
  emitStatus,
  isOnline,
  isPermanentStoredError,
  isUnmetered,
  publicStatus,
  refreshPendingStatus,
} from './auto-sync-status';
import type { MobileCloudSyncMode } from './v2-sync';

export async function startMobileCloudAutoSync(): Promise<void> {
  if (runtime.initialized) {
    startForegroundCoordinator(true);
    return;
  }
  runtime.initialized = true;
  try {
    // No cycle can be alive before this runtime is initialized. Any persisted
    // lease therefore belongs to a process that exited before releasing it.
    await recoverMobileCloudControl(true);
    const [enabled, audioOverCellular, config, initialNetwork] = await Promise.all([
      getMobileCloudAutoSyncEnabled(), getMobileCloudAudioOverCellularEnabled(),
      getMobileCloudConfig(), NetInfo.fetch(),
    ]);
    runtime.networkOnline = isOnline(initialNetwork);
    runtime.unmeteredNetwork = isUnmetered(initialNetwork);
    runtime.audioOverCellular = audioOverCellular;
    runtime.configuredContextCache = config
      ? { config, scopeId: await ensureMobileCloudScope(config) }
      : null;
    let initialStatus: Parameters<typeof createCoordinator>[2];
    if (config) {
      const scopeId = runtime.configuredContextCache?.scopeId ?? await ensureMobileCloudScope(config);
      const [persisted, pendingChanges] = await Promise.all([
        getMobileCloudPersistedState(scopeId), getMobileCloudPendingCount(scopeId),
      ]);
      initialStatus = {
        pendingChanges,
        pendingDownloads: persisted.pending_downloads,
        lastSuccessAt: persisted.last_success_at == null ? null : persisted.last_success_at * 1000,
        lastErrorKey: persisted.last_error,
        nextRetryAt: persisted.next_retry_at == null ? null : persisted.next_retry_at * 1000,
      };
    }
    runtime.coordinator = createCoordinator(enabled, Boolean(config), initialStatus);
    await refreshPendingStatus(config ?? undefined);
    runtime.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const previous = runtime.appState;
      runtime.appState = nextState;
      if (nextState === 'active' && previous !== 'active') startForegroundCoordinator(true);
      else if (nextState !== 'active' && previous === 'active') stopForegroundCoordinator();
    });
    runtime.networkSubscription = NetInfo.addEventListener((state) => void applyNetworkState(state));
    startForegroundCoordinator(true);
    if (enabled && config) await registerMobileCloudBackgroundTask().catch(() => {});
  } catch (error) {
    runtime.initialized = false;
    throw error;
  }
}

export function stopMobileCloudAutoSync(): void {
  stopForegroundCoordinator();
  runtime.appStateSubscription?.remove();
  runtime.appStateSubscription = null;
  runtime.networkSubscription?.();
  runtime.networkSubscription = null;
  runtime.coordinator = null;
  runtime.configuredContextCache = null;
  runtime.currentProgress = null;
  runtime.lastObservedGeneration = -1;
  runtime.initialized = false;
}

export function subscribeMobileCloudAutoSyncStatus(listener: StatusListener): () => void {
  runtime.listeners.add(listener);
  listener(publicStatus());
  return () => runtime.listeners.delete(listener);
}

export function getMobileCloudAutoSyncStatus(): CloudAutoSyncStatus {
  return publicStatus();
}

export async function setMobileCloudAutoSyncEnabled(enabled: boolean): Promise<void> {
  const coordinator = runtime.coordinator;
  const previousEnabled = coordinator?.getStatus().enabled
    ?? await getMobileCloudAutoSyncEnabled();
  if (!enabled) {
    // Stop the automatic transaction before the settings connection writes to
    // the same SQLite database. Otherwise a tap during apply can fail once and
    // only succeed after the sync releases its transaction.
    coordinator?.setEnabled(false);
    await runtime.activeCyclePromise?.catch(() => {});
  }
  try {
    await persistMobileCloudAutoSyncEnabled(enabled);
  } catch (error) {
    if (!enabled && previousEnabled) coordinator?.setEnabled(true);
    throw error;
  }
  const config = enabled ? await getMobileCloudConfig() : null;
  if (config) {
    const scopeId = await ensureMobileCloudScope(config);
    await updateMobileCloudPersistedState(scopeId, { last_error: null, next_retry_at: null });
  }
  coordinator?.setEnabled(enabled);
  if (enabled && config) {
    await registerMobileCloudBackgroundTask().catch(() => {});
    startForegroundCoordinator(true);
    if (runtime.appState === 'active') startJournalObserver();
  } else {
    stopJournalObserver();
    await unregisterMobileCloudBackgroundTask().catch(() => {});
  }
  emitStatus();
}

export async function stopMobileCloudAutoSyncCycle(): Promise<void> {
  runtime.currentController?.abort();
  runtime.coordinator?.cancelActive();
  await runtime.activeCyclePromise?.catch(() => {});
}

export async function setMobileCloudAudioOverCellular(enabled: boolean): Promise<void> {
  await persistMobileCloudAudioOverCellularEnabled(enabled);
  runtime.audioOverCellular = enabled;
  emitStatus();
  if (enabled && runtime.networkOnline && runtime.appState === 'active') {
    await runtime.coordinator?.runNow('auto').catch(() => {});
  }
}

export async function notifyMobileCloudConfigChanged(): Promise<void> {
  const restartForeground = runtime.foregroundStarted;
  const previousScopeId = runtime.configuredContextCache?.scopeId ?? null;
  runtime.statusPersistenceSuspended = true;
  runtime.currentProgress = null;
  stopForegroundCoordinator();
  runtime.currentController?.abort();
  runtime.coordinator?.cancelActive();
  try {
    if (runtime.activeCyclePromise) await runtime.activeCyclePromise.catch(() => {});
    await runtime.statusPersistChain.catch(() => {});
    const config = await getMobileCloudConfig();
    runtime.configuredContextCache = config
      ? { config, scopeId: await ensureMobileCloudScope(config) }
      : null;
    runtime.lastObservedGeneration = -1;
    if (config) {
      const scopeId = runtime.configuredContextCache!.scopeId;
      await updateMobileCloudPersistedState(scopeId, {
        last_error: null,
        next_retry_at: null,
        ...(previousScopeId != null && previousScopeId !== scopeId
          ? { needs_full_reconcile: 1 }
          : {}),
      });
      await refreshPendingStatus(config);
      if (await getMobileCloudAutoSyncEnabled()) {
        await registerMobileCloudBackgroundTask().catch(() => {});
      }
    } else {
      await unregisterMobileCloudBackgroundTask().catch(() => {});
    }
    runtime.statusPersistenceSuspended = false;
    runtime.coordinator?.notifyConfigurationChanged(Boolean(config));
  } finally {
    runtime.statusPersistenceSuspended = false;
    if (restartForeground && runtime.appState === 'active') startForegroundCoordinator(true);
  }
}

export async function runMobileCloudManualTask(
  mode: MobileCloudSyncMode,
  onProgress?: (progress: CloudSyncProgress) => void,
  restoreLocallyDeleted = false,
): Promise<CloudSyncResult | null> {
  if (runtime.activeCyclePromise || runtime.currentController) {
    runtime.currentController?.abort();
    runtime.coordinator?.cancelActive();
    await runtime.activeCyclePromise?.catch(() => {});
    runtime.currentProgress = null;
    emitStatus();
  }
  if (!runtime.activeCyclePromise && !runtime.currentController) {
    await recoverMobileCloudControl(true);
  }
  const config = await getMobileCloudConfig();
  if (config) {
    const scopeId = await ensureMobileCloudScope(config);
    await updateMobileCloudPersistedState(scopeId, { last_error: null, next_retry_at: null });
  }
  if (!runtime.coordinator) {
    runtime.coordinator = createCoordinator(await getMobileCloudAutoSyncEnabled(), Boolean(config));
  }
  const request: PendingManualRun = {
    mode,
    onProgress,
    result: null,
    cancelled: false,
    restoreLocallyDeleted,
  };
  runtime.pendingManualRun = request;
  try {
    await runtime.coordinator.runNow('manual');
    return request.result;
  } finally {
    if (runtime.pendingManualRun === request) runtime.pendingManualRun = null;
  }
}

export function cancelMobileCloudAutoSyncRun(): void {
  if (runtime.pendingManualRun) runtime.pendingManualRun.cancelled = true;
  runtime.currentController?.abort();
  runtime.coordinator?.cancelActive();
}

export async function runMobileCloudBackgroundSync(): Promise<void> {
  await recoverMobileCloudControl();
  const [enabled, audioOverCellular, config, network] = await Promise.all([
    getMobileCloudAutoSyncEnabled(), getMobileCloudAudioOverCellularEnabled(),
    getMobileCloudConfig(), NetInfo.fetch(),
  ]);
  if (!enabled || !config || !isOnline(network)) return;
  const scopeId = await ensureMobileCloudScope(config);
  const state = await getMobileCloudPersistedState(scopeId);
  if (isPermanentStoredError(state.last_error)) return;
  runtime.configuredContextCache = { config, scopeId };
  runtime.networkOnline = true;
  runtime.unmeteredNetwork = isUnmetered(network);
  runtime.audioOverCellular = audioOverCellular;
  await runBackgroundCycle();
}
