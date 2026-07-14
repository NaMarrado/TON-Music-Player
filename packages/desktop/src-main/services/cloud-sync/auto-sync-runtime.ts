import { BrowserWindow, net } from 'electron';
import {
  CloudAutoSyncCoordinator,
  normalizeCloudStorageErrorKey,
  type CloudAutoSyncState,
  type CloudAutoSyncStatus,
  type CloudSyncProgress,
  type CloudSyncResult,
} from '@ton/core';
import { scheduleMainProcessJob } from '../job-scheduler';
import {
  getActiveDesktopCloudScope,
  getDesktopCloudGeneration,
  readDesktopCloudAutoSyncStatus,
  readDesktopCloudOutbox,
  readDesktopCloudSyncState,
  updateDesktopCloudSyncState,
} from './auto-sync-store';
import {
  getDesktopCloudAutoSyncEnabled,
  getDesktopCloudConfig,
  setDesktopCloudAutoSyncEnabled,
} from './config';
import { syncCloudLibraryV2ForDesktop } from './index';

type ManualProgressListener = (progress: CloudSyncProgress) => void;

function broadcast(channel: 'cloud:state' | 'cloud:applied' | 'cloud:progress', payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

function pendingCount(): number {
  const scopeId = getActiveDesktopCloudScope();
  return scopeId ? readDesktopCloudOutbox(scopeId).length : 0;
}

function classifyError(error: unknown): 'transient' | 'permanent' | 'cancelled' {
  if (error instanceof Error) {
    if (error.message === 'cloud_sync_cancelled' || error.name === 'AbortError') {
      return 'cancelled';
    }
    const normalized = normalizeCloudStorageErrorKey(error.message);
    if (
      (normalized != null && normalized !== 'cloudStorageErrorConnectionFailed')
      || /not configured|secure storage|invalid manifest|cloud_sync_invalid_v2_manifest|cloud_sync_v2_manifest_missing/i.test(error.message)
    ) {
      return 'permanent';
    }
  }
  return 'transient';
}

class DesktopCloudAutoSyncRuntime {
  private readonly coordinator: CloudAutoSyncCoordinator;

  private generationTimer: ReturnType<typeof setInterval> | null = null;

  private networkTimer: ReturnType<typeof setInterval> | null = null;

  private lastObservedGeneration = 0;

  private activeAbortController: AbortController | null = null;

  private activeCycleDone: Promise<void> | null = null;

  private resolveActiveCycle: (() => void) | null = null;

  private lastResult: CloudSyncResult | null = null;

  private progressListeners = new Set<ManualProgressListener>();

  private started = false;

  private requestedManualMode: 'upload' | 'fetch' | 'sync' = 'sync';

  private manualRequestSequence = 0;

  private cancelledManualRequestSequence = 0;

  constructor() {
    const persisted = readDesktopCloudAutoSyncStatus();
    this.coordinator = new CloudAutoSyncCoordinator({
      enabled: persisted.enabled,
      configured: persisted.configured,
      online: net.online,
      initialStatus: {
        pendingChanges: persisted.pendingChanges,
        pendingDownloads: persisted.pendingDownloads,
        lastSuccessAt: persisted.lastSuccessAt,
        lastErrorKey: persisted.lastErrorKey,
        nextRetryAt: persisted.nextRetryAt,
      },
      initialPermanentError: persisted.lastErrorKey != null
        && classifyError(new Error(persisted.lastErrorKey)) === 'permanent',
      pollIntervalMs: 10_000,
      debounceMs: 2_000,
      maxDebounceMs: 10_000,
      run: async ({ origin }) => {
        if (origin === 'manual' && this.manualRequestSequence <= this.cancelledManualRequestSequence) {
          throw new Error('cloud_sync_cancelled');
        }
        this.activeAbortController = new AbortController();
        this.activeCycleDone = new Promise<void>((resolve) => {
          this.resolveActiveCycle = resolve;
        });
        try {
          const scopeId = getActiveDesktopCloudScope();
          const beforeRevision = scopeId ? readDesktopCloudSyncState(scopeId).revision : null;
          const mode = origin === 'manual' ? this.requestedManualMode : 'sync';
          const result = await scheduleMainProcessJob({
            kind: 'cloud-sync',
            lane: 'network',
            priority: origin === 'manual' ? 'user-visible' : 'background',
            run: () => syncCloudLibraryV2ForDesktop({
              signal: this.activeAbortController?.signal,
              mode,
              force: origin === 'manual',
              onProgress: (progress) => {
                broadcast('cloud:progress', progress);
                this.progressListeners.forEach((listener) => listener(progress));
              },
            }),
          });
          this.lastResult = result;
          const remaining = pendingCount();
          if (mode !== 'upload' && result.revision != null && result.revision !== beforeRevision) {
            broadcast('cloud:applied', {
              revision: result.revision,
              importedTracks: result.importedTracks,
              importedPlaylists: result.importedPlaylists,
            });
          }
          return { pendingChanges: remaining, pendingDownloads: 0 };
        } finally {
          this.activeAbortController = null;
          this.resolveActiveCycle?.();
          this.resolveActiveCycle = null;
        }
      },
      cancelActive: () => this.activeAbortController?.abort(new Error('cloud_sync_cancelled')),
      classifyError,
      getErrorKey: (error) => {
        if (!(error instanceof Error)) return 'cloudFailed';
        return normalizeCloudStorageErrorKey(error.message) ?? error.message;
      },
      onStatus: (status) => this.handleStatus(status),
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.coordinator.getStatus().enabled) {
      this.startWatchers();
    }
    this.coordinator.start(true);
  }

  private startWatchers(): void {
    if (this.generationTimer || this.networkTimer) return;
    this.lastObservedGeneration = getDesktopCloudGeneration();
    this.generationTimer = setInterval(() => {
      const generation = getDesktopCloudGeneration();
      if (generation === this.lastObservedGeneration) return;
      this.lastObservedGeneration = generation;
      this.coordinator.markLocalChange(pendingCount());
    }, 500);
    this.networkTimer = setInterval(() => this.coordinator.setOnline(net.online), 5_000);
  }

  private stopWatchers(): void {
    if (this.generationTimer) clearInterval(this.generationTimer);
    if (this.networkTimer) clearInterval(this.networkTimer);
    this.generationTimer = null;
    this.networkTimer = null;
  }

  stop(): void {
    this.started = false;
    this.stopWatchers();
    this.activeAbortController?.abort(new Error('cloud_sync_cancelled'));
    this.coordinator.stop();
  }

  notifyResume(): void {
    this.coordinator.setOnline(net.online);
  }

  notifySuspend(): void {
    this.coordinator.setOnline(false);
  }

  notifyConfigurationChanged(): void {
    const configured = Boolean(getDesktopCloudConfig());
    // A bucket/prefix/credential save changes the authority for the next
    // cycle. Never allow an in-flight request created from the old config to
    // apply its remote state after the active scope has switched.
    this.activeAbortController?.abort(new Error('cloud_sync_cancelled'));
    this.coordinator.notifyConfigurationChanged(configured);
    this.coordinator.setPendingCounts(pendingCount());
  }

  getStatus(): CloudAutoSyncStatus {
    const runtime = this.coordinator.getStatus();
    const persisted = readDesktopCloudAutoSyncStatus(runtime.state as CloudAutoSyncState);
    return {
      ...persisted,
      ...runtime,
      pendingChanges: pendingCount(),
      lastSuccessAt: runtime.lastSuccessAt ?? persisted.lastSuccessAt,
      lastErrorKey: runtime.lastErrorKey ?? persisted.lastErrorKey,
      nextRetryAt: runtime.nextRetryAt ?? persisted.nextRetryAt,
    };
  }

  setEnabled(enabled: boolean): CloudAutoSyncStatus {
    setDesktopCloudAutoSyncEnabled(enabled);
    if (enabled && this.started) this.startWatchers();
    if (!enabled) this.stopWatchers();
    this.coordinator.setEnabled(enabled);
    this.coordinator.setPendingCounts(pendingCount());
    return this.getStatus();
  }

  shouldKeepApplicationAlive(): boolean {
    const status = this.getStatus();
    return this.activeAbortController != null || (status.enabled && status.configured);
  }

  async runManual(
    mode: 'upload' | 'fetch' | 'sync' = 'sync',
    listener?: ManualProgressListener,
  ): Promise<CloudSyncResult | null> {
    const requestSequence = ++this.manualRequestSequence;
    if (listener) this.progressListeners.add(listener);
    try {
      this.lastResult = null;
      this.requestedManualMode = mode;
      // Auto Sync OFF intentionally stops the network watcher. Refresh the
      // coordinator from Electron's current state before a recovery button is
      // evaluated so an old offline state cannot reject a valid manual run.
      this.coordinator.setOnline(net.online);
      await this.coordinator.runNow('manual');
      if (requestSequence <= this.cancelledManualRequestSequence) {
        throw new Error('cloud_sync_cancelled');
      }
      return this.lastResult;
    } finally {
      if (listener) this.progressListeners.delete(listener);
    }
  }

  cancel(): void {
    this.cancelledManualRequestSequence = this.manualRequestSequence;
    this.coordinator.cancelActive();
  }

  async shutdownForQuit(): Promise<void> {
    this.started = false;
    this.stopWatchers();
    this.cancelledManualRequestSequence = this.manualRequestSequence;
    this.activeAbortController?.abort(new Error('cloud_sync_cancelled'));
    const cycleDone = this.activeCycleDone;
    this.coordinator.stop();
    await cycleDone?.catch(() => undefined);
  }

  private handleStatus(status: CloudAutoSyncStatus): void {
    if (!this.started) return;
    const scopeId = getActiveDesktopCloudScope();
    if (scopeId && this.started) {
      updateDesktopCloudSyncState(scopeId, {
        last_success_at: status.lastSuccessAt,
        last_error: status.lastErrorKey,
        next_retry_at: status.nextRetryAt,
      });
    }
    broadcast('cloud:state', this.getStatus());
  }
}

let runtime: DesktopCloudAutoSyncRuntime | null = null;

export function getDesktopCloudAutoSyncRuntime(): DesktopCloudAutoSyncRuntime {
  runtime ??= new DesktopCloudAutoSyncRuntime();
  return runtime;
}

export function startDesktopCloudAutoSync(): () => void {
  const service = getDesktopCloudAutoSyncRuntime();
  service.start();
  return () => service.stop();
}

export function isDesktopCloudAutoSyncEnabled(): boolean {
  return getDesktopCloudAutoSyncEnabled();
}
