import type { CloudAutoSyncStatus, CloudSyncOrigin } from '../../types/cloud-sync';
import type {
  CloudAutoSyncCoordinatorOptions,
  CloudAutoSyncErrorKind,
  CloudAutoSyncRunOutcome,
} from './auto-sync-coordinator-types';
import {
  DEFAULT_AUTO_SYNC_TIMER,
  DEFAULT_RETRY_DELAYS_MS,
  defaultCloudAutoSyncErrorKey,
} from './auto-sync-coordinator-types';
import { CloudAutoSyncRunQueue } from './auto-sync-run-queue';
import { CloudAutoSyncStateStore } from './auto-sync-state';
import { CloudAutoSyncRetryPolicy, CloudAutoSyncTimers } from './auto-sync-timers';

export type {
  CloudAutoSyncCoordinatorOptions,
  CloudAutoSyncErrorKind,
  CloudAutoSyncRunContext,
  CloudAutoSyncRunOutcome,
  CloudAutoSyncTimerAdapter,
} from './auto-sync-coordinator-types';

/** Runtime-neutral scheduler; platform code owns persistence and I/O. */
export class CloudAutoSyncCoordinator {
  private readonly pollIntervalMs: number;

  private readonly debounceMs: number;

  private readonly maxDebounceMs: number;

  private readonly now: () => number;

  private readonly classifyError: (error: unknown) => CloudAutoSyncErrorKind;

  private readonly getErrorKey: (error: unknown) => string;

  private readonly cancelActiveCallback: (() => void) | undefined;

  private readonly state: CloudAutoSyncStateStore;

  private readonly timers: CloudAutoSyncTimers;

  private readonly retryPolicy: CloudAutoSyncRetryPolicy;

  private readonly runQueue: CloudAutoSyncRunQueue;

  private started = false;

  private firstDirtyAt: number | null = null;

  constructor(options: CloudAutoSyncCoordinatorOptions) {
    this.pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 10_000);
    this.debounceMs = Math.max(0, options.debounceMs ?? 2_000);
    this.maxDebounceMs = Math.max(this.debounceMs, options.maxDebounceMs ?? 10_000);
    this.now = options.now ?? Date.now;
    this.classifyError = options.classifyError ?? (() => 'transient');
    this.getErrorKey = options.getErrorKey ?? defaultCloudAutoSyncErrorKey;
    this.cancelActiveCallback = options.cancelActive;
    this.state = new CloudAutoSyncStateStore(options, this.now);
    this.timers = new CloudAutoSyncTimers(options.timer ?? DEFAULT_AUTO_SYNC_TIMER);
    this.retryPolicy = new CloudAutoSyncRetryPolicy(
      options.retryDelaysMs?.length
        ? options.retryDelaysMs.map((value) => Math.max(0, value))
        : DEFAULT_RETRY_DELAYS_MS,
      Math.min(1, Math.max(0, options.retryJitterRatio ?? 0.15)),
      options.random ?? Math.random,
    );
    this.runQueue = new CloudAutoSyncRunQueue({
      run: options.run,
      beforeRun: (origin) => this.beforeRun(origin),
      afterSuccess: (outcome) => this.afterSuccess(outcome),
      afterFailure: (error, origin) => this.afterFailure(error, origin),
      afterRun: () => {},
      onIdle: () => this.schedulePoll(),
    });
  }

  start(runImmediately = true): void {
    if (this.started) return;
    this.started = true;
    this.state.emit();
    if (this.state.value.nextRetryAt != null && this.canRunAutomatically()) {
      this.resumePersistedRetry();
    } else if (runImmediately && this.canRunAutomatically()) {
      this.fireAndForget('auto');
    } else {
      this.schedulePoll();
    }
  }

  stop(): void {
    this.started = false;
    this.timers.clearAll();
    this.firstDirtyAt = null;
    this.runQueue.dropAutomatic(new Error('cloudAutoSyncStopped'));
    if (this.runQueue.activeOrigin !== 'manual') this.cancelActiveCallback?.();
  }

  getStatus(): CloudAutoSyncStatus {
    return this.state.snapshot();
  }

  setPendingCounts(
    pendingChanges: number,
    pendingDownloads = this.state.value.pendingDownloads,
  ): void {
    this.state.update({
      pendingChanges: Math.max(0, Math.trunc(pendingChanges)),
      pendingDownloads: Math.max(0, Math.trunc(pendingDownloads)),
    });
  }

  setEnabled(enabled: boolean): void {
    if (this.state.value.enabled === enabled) return;
    this.state.update({
      enabled,
      lastErrorKey: enabled ? null : this.state.value.lastErrorKey,
    });
    this.state.setBlocked(false);
    this.retryPolicy.reset();
    this.timers.clearAll();
    this.firstDirtyAt = null;
    if (!enabled) {
      this.runQueue.dropAutomatic(new Error('cloudAutoSyncDisabled'));
      if (this.runQueue.activeOrigin !== 'manual') this.cancelActiveCallback?.();
      this.state.update({ state: 'disabled', nextRetryAt: null });
      return;
    }
    this.updateDerivedIdleState();
    if (this.started && this.canRunAutomatically()) this.fireAndForget('auto');
  }

  setConfigured(configured: boolean): void {
    this.applyConfiguration(configured, false);
  }

  notifyConfigurationChanged(configured: boolean): void {
    this.applyConfiguration(configured, true);
  }

  setOnline(online: boolean): void {
    if (online === this.state.isOnline) return;
    this.state.setOnline(online);
    if (!online) {
      this.timers.clear('poll');
      this.clearRetryTimer();
      if (this.runQueue.activeOrigin !== 'manual') this.cancelActiveCallback?.();
      this.state.update({
        state: this.state.value.enabled && this.state.value.configured
          ? 'offline'
          : this.state.baseIdleState(),
      });
      return;
    }
    this.updateDerivedIdleState();
    if (this.started && this.canRunAutomatically()) this.fireAndForget('auto');
  }

  markLocalChange(pendingChanges?: number): void {
    this.state.update({
      pendingChanges: pendingChanges == null
        ? this.state.value.pendingChanges + 1
        : Math.max(0, Math.trunc(pendingChanges)),
    });
    if (!this.started || !this.canRunAutomatically()) return;
    this.clearRetryTimer();
    this.retryPolicy.reset();
    const now = this.now();
    this.firstDirtyAt ??= now;
    const remainingMaximum = Math.max(0, this.maxDebounceMs - Math.max(0, now - this.firstDirtyAt));
    this.timers.set('debounce', () => {
      this.firstDirtyAt = null;
      this.fireAndForget('auto');
    }, Math.min(this.debounceMs, remainingMaximum));
  }

  runNow(origin: CloudSyncOrigin = 'manual'): Promise<void> {
    if (!this.state.value.configured) return Promise.reject(new Error('cloudAutoSyncUnconfigured'));
    if (!this.state.isOnline) return Promise.reject(new Error('cloudAutoSyncOffline'));
    if (origin !== 'manual' && (!this.started || !this.canRunAutomatically())) {
      return Promise.resolve();
    }
    if (origin === 'manual') {
      this.state.setBlocked(false);
      this.retryPolicy.reset();
      this.clearRetryTimer();
    }
    return this.runQueue.enqueue(origin);
  }

  cancelActive(): void {
    this.cancelActiveCallback?.();
  }

  private applyConfiguration(configured: boolean, forceRetry: boolean): void {
    if (this.state.value.configured === configured && !forceRetry) return;
    this.state.update({ configured, lastErrorKey: null });
    this.state.setBlocked(false);
    this.retryPolicy.reset();
    this.clearRetryTimer();
    if (!configured) {
      this.timers.clear('poll');
      this.timers.clear('debounce');
      this.runQueue.dropAutomatic(new Error('cloudAutoSyncUnconfigured'));
      if (this.runQueue.activeOrigin !== 'manual') this.cancelActiveCallback?.();
      this.state.update({ state: this.state.value.enabled ? 'unconfigured' : 'disabled' });
      return;
    }
    this.updateDerivedIdleState();
    if (this.started && this.canRunAutomatically()) this.fireAndForget('auto');
  }

  private beforeRun(origin: CloudSyncOrigin): void {
    this.timers.clear('poll');
    this.timers.clear('debounce');
    if (origin === 'manual') this.clearRetryTimer();
    this.firstDirtyAt = null;
    this.state.update({ state: 'syncing', nextRetryAt: null });
  }

  private afterSuccess(outcome: CloudAutoSyncRunOutcome | void): void {
    this.retryPolicy.reset();
    this.state.setBlocked(false);
    this.state.update({
      state: this.state.baseIdleState(),
      pendingChanges: outcome?.pendingChanges ?? this.state.value.pendingChanges,
      pendingDownloads: outcome?.pendingDownloads ?? this.state.value.pendingDownloads,
      lastSuccessAt: this.now(),
      lastErrorKey: null,
      nextRetryAt: null,
    });
  }

  private afterFailure(error: unknown, origin: CloudSyncOrigin): boolean {
    const kind = this.classifyError(error);
    if (kind === 'cancelled') {
      this.state.update({ state: this.state.baseIdleState(), nextRetryAt: null });
    } else if (kind === 'permanent') {
      this.state.setBlocked(true);
      this.state.update({ state: 'error', lastErrorKey: this.getErrorKey(error), nextRetryAt: null });
    } else {
      this.state.update({ lastErrorKey: this.getErrorKey(error) });
      this.scheduleRetry();
    }
    return kind === 'cancelled' && origin !== 'manual' && this.canRunAutomatically();
  }

  private scheduleRetry(): void {
    if (!this.canRunAutomatically()) {
      this.updateDerivedIdleState();
      return;
    }
    this.clearRetryTimer();
    const delay = this.retryPolicy.nextDelay();
    const nextRetryAt = this.now() + delay;
    this.state.update({ state: 'backing-off', nextRetryAt });
    this.timers.set('retry', () => {
      this.state.update({ nextRetryAt: null });
      this.fireAndForget('auto');
    }, delay);
  }

  private resumePersistedRetry(): void {
    const retryAt = this.state.value.nextRetryAt;
    if (retryAt == null || !this.canRunAutomatically()) return;
    const delay = Math.max(0, retryAt - this.now());
    this.state.update({ state: 'backing-off', nextRetryAt: retryAt });
    this.timers.set('retry', () => {
      this.state.update({ nextRetryAt: null });
      this.fireAndForget('auto');
    }, delay);
  }

  private schedulePoll(): void {
    if (this.timers.hasPoll || this.timers.hasDebounce || this.timers.hasRetry
      || this.runQueue.isRunning || !this.canRunAutomatically()) return;
    this.timers.set('poll', () => this.fireAndForget('auto'), this.pollIntervalMs);
  }

  private fireAndForget(origin: CloudSyncOrigin): void {
    void this.runNow(origin).catch(() => {});
  }

  private canRunAutomatically(): boolean {
    return this.state.canRunAutomatically(this.started);
  }

  private updateDerivedIdleState(): void {
    this.state.update({ state: this.state.baseIdleState(), nextRetryAt: null });
    this.schedulePoll();
  }

  private clearRetryTimer(): void {
    this.timers.clear('retry');
    if (this.state.value.nextRetryAt != null) this.state.update({ nextRetryAt: null });
  }
}
