import type { NetInfoState } from '@react-native-community/netinfo';
import { CloudAutoSyncCoordinator, type CloudAutoSyncStatus } from '@ton/core';
import {
  ensureMobileCloudScope,
  getMobileCloudJournalGeneration,
  getMobileCloudOutbox,
} from './local-state';
import { runTrackedCycle } from './auto-sync-cycle';
import { mobileAutoSyncRuntime as runtime } from './auto-sync-state';
import {
  classifyError,
  emitStatus,
  errorKey,
  isOnline,
  isPermanentStoredError,
  isUnmetered,
  persistRuntimeStatus,
  publicStatus,
} from './auto-sync-status';

export function createCoordinator(
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
    online: runtime.networkOnline,
    initialStatus,
    initialPermanentError: isPermanentStoredError(initialStatus?.lastErrorKey ?? null),
    pollIntervalMs: 10_000,
    debounceMs: 2_000,
    maxDebounceMs: 10_000,
    run: ({ origin }) => runTrackedCycle(origin),
    cancelActive: () => runtime.currentController?.abort(),
    classifyError,
    getErrorKey: errorKey,
    onStatus: (status) => {
      runtime.baseStatus = status;
      const snapshot = publicStatus();
      if (!runtime.statusPersistenceSuspended) {
        const scopeId = runtime.configuredContextCache?.scopeId ?? null;
        runtime.statusPersistChain = runtime.statusPersistChain
          .catch(() => {})
          .then(() => persistRuntimeStatus(snapshot, scopeId));
      }
      emitStatus();
    },
  });
}

async function observeJournal(): Promise<void> {
  const context = runtime.configuredContextCache;
  if (!context) return;
  const generation = await getMobileCloudJournalGeneration();
  if (generation === runtime.lastObservedGeneration) return;
  await ensureMobileCloudScope(context.config);
  const rows = await getMobileCloudOutbox(context.scopeId);
  if (generation !== runtime.lastObservedGeneration) {
    runtime.lastObservedGeneration = generation;
    if (rows.length > 0) runtime.coordinator?.markLocalChange(rows.length);
    else if (runtime.baseStatus.pendingChanges !== 0) {
      runtime.coordinator?.setPendingCounts(0, runtime.baseStatus.pendingDownloads);
    }
  } else if (runtime.baseStatus.pendingChanges !== rows.length) {
    runtime.coordinator?.setPendingCounts(rows.length, runtime.baseStatus.pendingDownloads);
  }
}

export function startJournalObserver(): void {
  if (runtime.journalTimer) return;
  void observeJournal().catch(() => {});
  runtime.journalTimer = setInterval(() => void observeJournal().catch(() => {}), 1_000);
}

export function stopJournalObserver(): void {
  if (!runtime.journalTimer) return;
  clearInterval(runtime.journalTimer);
  runtime.journalTimer = null;
}

export function startForegroundCoordinator(runImmediately = true): void {
  if (!runtime.coordinator || runtime.foregroundStarted || runtime.appState !== 'active') return;
  runtime.foregroundStarted = true;
  runtime.coordinator.start(runImmediately);
  if (runtime.coordinator.getStatus().enabled) startJournalObserver();
}

export function stopForegroundCoordinator(): void {
  runtime.foregroundStarted = false;
  stopJournalObserver();
  // Moving to the background must stop timers, not the transfer already in
  // flight. FileSystem/native transfers can continue while JS is suspended.
  runtime.coordinator?.stop(false);
}

export async function applyNetworkState(state: NetInfoState): Promise<void> {
  const wasOnline = runtime.networkOnline;
  const wasUnmetered = runtime.unmeteredNetwork;
  runtime.networkOnline = isOnline(state);
  runtime.unmeteredNetwork = isUnmetered(state);
  runtime.coordinator?.setOnline(runtime.networkOnline);
  emitStatus();
  if (wasOnline && runtime.networkOnline && !wasUnmetered
      && (runtime.unmeteredNetwork || runtime.audioOverCellular)
      && runtime.appState === 'active') {
    await runtime.coordinator?.runNow('auto').catch(() => {});
  }
}
