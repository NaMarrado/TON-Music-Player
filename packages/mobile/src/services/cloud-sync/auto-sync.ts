import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import {
  CloudAutoSyncCoordinator,
  buildCloudV2ManifestObjectKey,
  normalizeCloudStorageErrorKey,
  type CloudAutoSyncStatus,
  type CloudStorageConfig,
  type CloudSyncOrigin,
  type CloudSyncProgress,
  type CloudSyncResult,
} from '@ton/core';
import {
  getMobileCloudAutoSyncEnabled,
  getMobileCloudConfig,
  setMobileCloudAutoSyncEnabled as persistMobileCloudAutoSyncEnabled,
} from './config';
import {
  acquireMobileCloudLease,
  ensureMobileCloudScope,
  getMobileCloudJournalGeneration,
  getMobileCloudOutbox,
  getMobileCloudPendingCount,
  getMobileCloudPersistedState,
  recoverMobileCloudControl,
  releaseMobileCloudLease,
  renewMobileCloudLease,
  updateMobileCloudPersistedState,
} from './local-state';
import { MobileR2Client } from './r2-client';
import { runMobileCloudV2Sync, type MobileCloudSyncMode } from './v2-sync';
import {
  registerMobileCloudBackgroundTask,
  unregisterMobileCloudBackgroundTask,
} from './background-registration';

type StatusListener = (status: CloudAutoSyncStatus) => void;

interface PendingManualRun {
  mode: MobileCloudSyncMode;
  onProgress?: (progress: CloudSyncProgress) => void;
  result: CloudSyncResult | null;
  cancelled: boolean;
}

let coordinator: CloudAutoSyncCoordinator | null = null;
let baseStatus: CloudAutoSyncStatus = {
  enabled: true,
  configured: false,
  state: 'unconfigured',
  pendingChanges: 0,
  pendingDownloads: 0,
  lastSuccessAt: null,
  lastErrorKey: null,
  nextRetryAt: null,
};
let currentController: AbortController | null = null;
let activeCyclePromise: Promise<{
  pendingChanges: number;
  pendingDownloads: number;
}> | null = null;
let pendingManualRun: PendingManualRun | null = null;
let appState: AppStateStatus = AppState.currentState;
let networkOnline = true;
let unmeteredNetwork = true;
let initialized = false;
let foregroundStarted = false;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let networkSubscription: (() => void) | null = null;
let journalTimer: ReturnType<typeof setInterval> | null = null;
let lastObservedGeneration = -1;
let configuredContextCache: { config: CloudStorageConfig; scopeId: string } | null = null;
let statusPersistChain: Promise<void> = Promise.resolve();
let statusPersistenceSuspended = false;
const listeners = new Set<StatusListener>();

function isOnline(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

function isUnmetered(state: NetInfoState): boolean {
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  if (details?.isConnectionExpensive === true) {
    return false;
  }
  if (state.type === 'wifi' || state.type === 'ethernet') {
    return true;
  }
  return details?.isConnectionExpensive === false && state.type !== 'cellular';
}

function publicStatus(): CloudAutoSyncStatus {
  if (
    baseStatus.state === 'idle'
    && baseStatus.pendingDownloads > 0
    && networkOnline
    && !unmeteredNetwork
  ) {
    return { ...baseStatus, state: 'waiting-for-wifi' };
  }
  return { ...baseStatus };
}

function emitStatus(): void {
  const status = publicStatus();
  listeners.forEach((listener) => listener(status));
}

function classifyError(error: unknown): 'transient' | 'permanent' | 'cancelled' {
  if (
    currentController?.signal.aborted
    || (error instanceof Error && (
      error.name === 'AbortError'
      || error.message === 'cloud_sync_cancelled'
      || error.message === 'cloudAutoSyncDisabled'
      || error.message === 'cloudAutoSyncStopped'
    ))
  ) {
    return 'cancelled';
  }
  if (error instanceof Error && (
    error.message === 'cloud_sync_invalid_v2_manifest'
    || error.message === 'cloud_sync_v2_manifest_missing'
    || error.message === 'cloud_sync_missing_etag'
  )) {
    return 'permanent';
  }
  const key = error instanceof Error ? normalizeCloudStorageErrorKey(error.message) : null;
  return key && key !== 'cloudStorageErrorConnectionFailed' ? 'permanent' : 'transient';
}

function errorKey(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'cloudFailed';
  }
  return normalizeCloudStorageErrorKey(error.message) ?? error.message ?? 'cloudFailed';
}

function isPermanentStoredError(value: string | null): boolean {
  if (!value) {
    return false;
  }
  if (
    value === 'cloud_sync_invalid_v2_manifest'
    || value === 'cloud_sync_v2_manifest_missing'
    || value === 'cloud_sync_missing_etag'
    || value === 'cloudAutoSyncUnconfigured'
  ) {
    return true;
  }
  const normalized = normalizeCloudStorageErrorKey(value);
  return normalized != null && normalized !== 'cloudStorageErrorConnectionFailed';
}

async function getConfiguredContext(): Promise<{
  config: CloudStorageConfig;
  scopeId: string;
}> {
  if (configuredContextCache) {
    return configuredContextCache;
  }
  const config = await getMobileCloudConfig();
  if (!config) {
    throw new Error('cloudAutoSyncUnconfigured');
  }
  configuredContextCache = { config, scopeId: await ensureMobileCloudScope(config) };
  return configuredContextCache;
}

async function refreshPendingStatus(config?: CloudStorageConfig): Promise<{
  pendingChanges: number;
  pendingDownloads: number;
}> {
  if (!config) {
    const pendingChanges = await getMobileCloudPendingCount();
    coordinator?.setPendingCounts(pendingChanges, 0);
    return { pendingChanges, pendingDownloads: 0 };
  }
  const scopeId = await ensureMobileCloudScope(config);
  const [pendingChanges, state] = await Promise.all([
    getMobileCloudPendingCount(scopeId),
    getMobileCloudPersistedState(scopeId),
  ]);
  coordinator?.setPendingCounts(pendingChanges, state.pending_downloads);
  return { pendingChanges, pendingDownloads: state.pending_downloads };
}

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
  currentController = controller;
  let leaseLost = false;
  const leaseHeartbeat = origin === 'background'
    ? null
    : setInterval(() => {
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
    const manual = origin === 'manual' ? pendingManualRun : null;
    if (manual?.cancelled) {
      throw new Error('cloud_sync_cancelled');
    }
    const requestedMode = manual?.mode ?? 'sync';
    // A fetch must not overwrite an unsent local edit whose durable outbox row
    // only stores identity, not a second copy of all metadata. Merge/upload the
    // pending edits first and then apply the remote result in one sync cycle.
    const mode = requestedMode === 'fetch' && outbox.length > 0
      ? 'sync'
      : requestedMode;

    // The common 10-second path is exactly one conditional GET. No hashing,
    // HEAD requests, SQL apply or manifest write occurs after a 304.
    if (
      origin !== 'manual'
      && outbox.length === 0
      && state.needs_full_reconcile === 0
      && state.activation_marker_confirmed === 1
      && !((state.pending_downloads > 0 || state.pending_assets > 0) && unmeteredNetwork)
      && state.last_cleanup_at != null
      && Math.floor(Date.now() / 1000) - state.last_cleanup_at < 24 * 60 * 60
    ) {
      const poll = await new MobileR2Client(config).getJsonConditional(
        buildCloudV2ManifestObjectKey(config.prefix),
        state.etag ?? undefined,
        controller.signal,
      );
      if (poll.status === 'not-modified') {
        return { pendingChanges: 0, pendingDownloads: state.pending_downloads };
      }
      // Persist the observed ETag only after the corresponding manifest has
      // been fully applied. A crash here deliberately causes a re-fetch.
    }

    const result = await runMobileCloudV2Sync({
      config,
      mode,
      origin,
      allowAudioDownloads: origin === 'manual' || unmeteredNetwork,
      onProgress: manual?.onProgress,
      signal: controller.signal,
    });
    if (manual) {
      manual.result = result;
    }
    const pending = await refreshPendingStatus(config);
    return pending;
  } catch (error) {
    if (classifyError(error) !== 'cancelled' && !leaseLost) {
      await updateMobileCloudPersistedState(scopeId, { last_error: errorKey(error) }).catch(() => {});
    }
    throw error;
  } finally {
    if (backgroundDeadline) {
      clearTimeout(backgroundDeadline);
    }
    if (leaseHeartbeat) {
      clearInterval(leaseHeartbeat);
    }
    if (currentController === controller) {
      currentController = null;
    }
    await releaseMobileCloudLease(owner).catch(() => {});
  }
}

function runTrackedCycle(origin: CloudSyncOrigin): Promise<{
  pendingChanges: number;
  pendingDownloads: number;
}> {
  const cycle = runCycle(origin);
  const tracked = cycle.finally(() => {
    if (activeCyclePromise === tracked) {
      activeCyclePromise = null;
    }
  });
  activeCyclePromise = tracked;
  return tracked;
}

function createCoordinator(
  enabled: boolean,
  configured: boolean,
  initialStatus?: Partial<Pick<
    CloudAutoSyncStatus,
    'pendingChanges' | 'pendingDownloads' | 'lastSuccessAt' | 'lastErrorKey' | 'nextRetryAt'
  >>,
): CloudAutoSyncCoordinator {
  return new CloudAutoSyncCoordinator({
    enabled,
    configured,
    online: networkOnline,
    initialStatus,
    initialPermanentError: isPermanentStoredError(initialStatus?.lastErrorKey ?? null),
    pollIntervalMs: 10_000,
    debounceMs: 2_000,
    maxDebounceMs: 10_000,
    run: ({ origin }) => runTrackedCycle(origin),
    cancelActive: () => currentController?.abort(),
    classifyError,
    getErrorKey: errorKey,
    onStatus: (status) => {
      baseStatus = status;
      const snapshot = publicStatus();
      if (!statusPersistenceSuspended) {
        const scopeId = configuredContextCache?.scopeId ?? null;
        statusPersistChain = statusPersistChain
          .catch(() => {})
          .then(() => persistRuntimeStatus(snapshot, scopeId));
      }
      emitStatus();
    },
  });
}

async function observeJournal(): Promise<void> {
  const context = configuredContextCache;
  if (!context) {
    return;
  }
  const generation = await getMobileCloudJournalGeneration();
  if (generation === lastObservedGeneration) {
    return;
  }
  // Triggers journal into the unscoped inbox. Adopt only when the monotonic
  // generation changes, avoiding a write transaction on every 1-second poll.
  await ensureMobileCloudScope(context.config);
  const rows = await getMobileCloudOutbox(context.scopeId);
  if (generation !== lastObservedGeneration) {
    lastObservedGeneration = generation;
    if (rows.length > 0) {
      coordinator?.markLocalChange(rows.length);
    } else if (baseStatus.pendingChanges !== 0) {
      coordinator?.setPendingCounts(0, baseStatus.pendingDownloads);
    }
  } else if (baseStatus.pendingChanges !== rows.length) {
    coordinator?.setPendingCounts(rows.length, baseStatus.pendingDownloads);
  }
}

function startJournalObserver(): void {
  if (journalTimer) {
    return;
  }
  void observeJournal().catch(() => {});
  journalTimer = setInterval(() => {
    void observeJournal().catch(() => {});
  }, 1_000);
}

function stopJournalObserver(): void {
  if (journalTimer) {
    clearInterval(journalTimer);
    journalTimer = null;
  }
}

function startForegroundCoordinator(runImmediately = true): void {
  if (!coordinator || foregroundStarted || appState !== 'active') {
    return;
  }
  foregroundStarted = true;
  coordinator.start(runImmediately);
  if (coordinator.getStatus().enabled) {
    startJournalObserver();
  }
}

function stopForegroundCoordinator(): void {
  foregroundStarted = false;
  stopJournalObserver();
  coordinator?.stop();
}

async function applyNetworkState(state: NetInfoState): Promise<void> {
  const wasOnline = networkOnline;
  const wasUnmetered = unmeteredNetwork;
  networkOnline = isOnline(state);
  unmeteredNetwork = isUnmetered(state);
  coordinator?.setOnline(networkOnline);
  emitStatus();
  if (wasOnline && networkOnline && !wasUnmetered && unmeteredNetwork && appState === 'active') {
    await coordinator?.runNow('auto').catch(() => {});
  }
}

async function persistRuntimeStatus(
  status: CloudAutoSyncStatus,
  capturedScopeId: string | null,
): Promise<void> {
  let scopeId = capturedScopeId;
  if (!scopeId) {
    const config = await getMobileCloudConfig().catch(() => null);
    if (!config) {
      return;
    }
    scopeId = await ensureMobileCloudScope(config);
  }
  await updateMobileCloudPersistedState(scopeId, {
    last_success_at: status.lastSuccessAt == null
      ? undefined
      : Math.floor(status.lastSuccessAt / 1000),
    last_error: status.lastErrorKey,
    next_retry_at: status.nextRetryAt == null
      ? null
      : Math.floor(status.nextRetryAt / 1000),
  });
}

export async function startMobileCloudAutoSync(): Promise<void> {
  if (initialized) {
    startForegroundCoordinator(true);
    return;
  }
  initialized = true;
  try {
    await recoverMobileCloudControl();
    const [enabled, config, initialNetwork] = await Promise.all([
      getMobileCloudAutoSyncEnabled(),
      getMobileCloudConfig(),
      NetInfo.fetch(),
    ]);
    networkOnline = isOnline(initialNetwork);
    unmeteredNetwork = isUnmetered(initialNetwork);
    configuredContextCache = config
      ? { config, scopeId: await ensureMobileCloudScope(config) }
      : null;
    let initialStatus: Parameters<typeof createCoordinator>[2];
    if (config) {
      const scopeId = configuredContextCache?.scopeId ?? await ensureMobileCloudScope(config);
      const [persisted, pendingChanges] = await Promise.all([
        getMobileCloudPersistedState(scopeId),
        getMobileCloudPendingCount(scopeId),
      ]);
      const lastSuccessAt = persisted.last_success_at == null
        ? null
        : persisted.last_success_at * 1000;
      const nextRetryAt = persisted.next_retry_at == null
        ? null
        : persisted.next_retry_at * 1000;
      initialStatus = {
        pendingChanges,
        pendingDownloads: persisted.pending_downloads,
        lastSuccessAt,
        lastErrorKey: persisted.last_error,
        nextRetryAt,
      };
    }
    coordinator = createCoordinator(enabled, Boolean(config), initialStatus);
    await refreshPendingStatus(config ?? undefined);

    appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previous = appState;
      appState = nextState;
      if (nextState === 'active' && previous !== 'active') {
        startForegroundCoordinator(true);
      } else if (nextState !== 'active' && previous === 'active') {
        stopForegroundCoordinator();
      }
    });
    networkSubscription = NetInfo.addEventListener((state) => {
      void applyNetworkState(state);
    });
    startForegroundCoordinator(true);
    if (enabled && config) {
      await registerMobileCloudBackgroundTask().catch(() => {});
    }
  } catch (error) {
    initialized = false;
    throw error;
  }
}

export function stopMobileCloudAutoSync(): void {
  stopForegroundCoordinator();
  appStateSubscription?.remove();
  appStateSubscription = null;
  networkSubscription?.();
  networkSubscription = null;
  coordinator = null;
  configuredContextCache = null;
  lastObservedGeneration = -1;
  initialized = false;
}

export function subscribeMobileCloudAutoSyncStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(publicStatus());
  return () => listeners.delete(listener);
}

export function getMobileCloudAutoSyncStatus(): CloudAutoSyncStatus {
  return publicStatus();
}

export async function setMobileCloudAutoSyncEnabled(enabled: boolean): Promise<void> {
  await persistMobileCloudAutoSyncEnabled(enabled);
  if (enabled) {
    const config = await getMobileCloudConfig();
    if (config) {
      const scopeId = await ensureMobileCloudScope(config);
      await updateMobileCloudPersistedState(scopeId, {
        last_error: null,
        next_retry_at: null,
      });
    }
  }
  coordinator?.setEnabled(enabled);
  if (enabled && await getMobileCloudConfig()) {
    await registerMobileCloudBackgroundTask().catch(() => {});
    startForegroundCoordinator(true);
    if (appState === 'active') {
      startJournalObserver();
    }
  } else {
    stopJournalObserver();
    await unregisterMobileCloudBackgroundTask().catch(() => {});
  }
  emitStatus();
}

export async function notifyMobileCloudConfigChanged(): Promise<void> {
  const restartForeground = foregroundStarted;
  const previousScopeId = configuredContextCache?.scopeId ?? null;
  statusPersistenceSuspended = true;
  stopForegroundCoordinator();
  currentController?.abort();
  coordinator?.cancelActive();
  try {
    const activeCycle = activeCyclePromise;
    if (activeCycle) {
      await activeCycle.catch(() => {});
    }
    // A status emitted just before the configuration save may have resolved
    // the newly persisted config while it was waiting in this chain. Drain it
    // before opening the scope transaction so two SQLite statements cannot
    // compete for the same connection.
    await statusPersistChain.catch(() => {});

    const config = await getMobileCloudConfig();
    configuredContextCache = config
      ? { config, scopeId: await ensureMobileCloudScope(config) }
      : null;
    lastObservedGeneration = -1;
    if (config) {
      await updateMobileCloudPersistedState(configuredContextCache!.scopeId, {
        last_error: null,
        next_retry_at: null,
        ...(previousScopeId != null && previousScopeId !== configuredContextCache!.scopeId
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
    statusPersistenceSuspended = false;
    coordinator?.notifyConfigurationChanged(Boolean(config));
  } finally {
    statusPersistenceSuspended = false;
    if (restartForeground && appState === 'active') {
      startForegroundCoordinator(true);
    }
  }
}

export async function runMobileCloudManualTask(
  mode: MobileCloudSyncMode,
  onProgress?: (progress: CloudSyncProgress) => void,
): Promise<CloudSyncResult | null> {
  const config = await getMobileCloudConfig();
  if (config) {
    const scopeId = await ensureMobileCloudScope(config);
    await updateMobileCloudPersistedState(scopeId, {
      last_error: null,
      next_retry_at: null,
    });
  }
  if (!coordinator) {
    coordinator = createCoordinator(await getMobileCloudAutoSyncEnabled(), Boolean(config));
  }
  const request: PendingManualRun = { mode, onProgress, result: null, cancelled: false };
  pendingManualRun = request;
  try {
    await coordinator.runNow('manual');
    return request.result;
  } finally {
    if (pendingManualRun === request) {
      pendingManualRun = null;
    }
  }
}

export function cancelMobileCloudAutoSyncRun(): void {
  if (pendingManualRun) {
    pendingManualRun.cancelled = true;
  }
  currentController?.abort();
  coordinator?.cancelActive();
}

export async function runMobileCloudBackgroundSync(): Promise<void> {
  await recoverMobileCloudControl();
  const [enabled, config, network] = await Promise.all([
    getMobileCloudAutoSyncEnabled(),
    getMobileCloudConfig(),
    NetInfo.fetch(),
  ]);
  if (!enabled || !config || !isOnline(network)) {
    return;
  }
  const scopeId = await ensureMobileCloudScope(config);
  const state = await getMobileCloudPersistedState(scopeId);
  if (isPermanentStoredError(state.last_error)) {
    return;
  }
  networkOnline = true;
  unmeteredNetwork = isUnmetered(network);
  await runCycle('background');
}
