import { AppState, type AppStateStatus } from 'react-native';
import type {
  CloudAutoSyncCoordinator,
  CloudAutoSyncStatus,
  CloudStorageConfig,
  CloudSyncProgress,
  CloudSyncResult,
} from '@ton/core';
import type { MobileCloudSyncMode } from './v2-sync';

export type StatusListener = (status: CloudAutoSyncStatus) => void;

export interface PendingManualRun {
  mode: MobileCloudSyncMode;
  onProgress?: (progress: CloudSyncProgress) => void;
  result: CloudSyncResult | null;
  cancelled: boolean;
}

type CycleResult = { pendingChanges: number; pendingDownloads: number };

export const mobileAutoSyncRuntime = {
  coordinator: null as CloudAutoSyncCoordinator | null,
  baseStatus: {
    enabled: true,
    configured: false,
    state: 'unconfigured',
    pendingChanges: 0,
    pendingDownloads: 0,
    lastSuccessAt: null,
    lastErrorKey: null,
    nextRetryAt: null,
  } as CloudAutoSyncStatus,
  currentController: null as AbortController | null,
  activeCyclePromise: null as Promise<CycleResult> | null,
  pendingManualRun: null as PendingManualRun | null,
  appState: AppState.currentState as AppStateStatus,
  networkOnline: true,
  unmeteredNetwork: true,
  initialized: false,
  foregroundStarted: false,
  appStateSubscription: null as ReturnType<typeof AppState.addEventListener> | null,
  networkSubscription: null as (() => void) | null,
  journalTimer: null as ReturnType<typeof setInterval> | null,
  lastObservedGeneration: -1,
  configuredContextCache: null as { config: CloudStorageConfig; scopeId: string } | null,
  statusPersistChain: Promise.resolve() as Promise<void>,
  statusPersistenceSuspended: false,
  listeners: new Set<StatusListener>(),
};
