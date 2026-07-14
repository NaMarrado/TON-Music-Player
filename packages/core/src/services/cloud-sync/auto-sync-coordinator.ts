import type {
  CloudAutoSyncStatus,
  CloudSyncOrigin,
} from '../../types/cloud-sync';

declare function setTimeout(callback: () => void, ms: number): number;
declare function clearTimeout(id: number): void;

export type CloudAutoSyncErrorKind = 'transient' | 'permanent' | 'cancelled';

export interface CloudAutoSyncRunContext {
  origin: CloudSyncOrigin;
}

export interface CloudAutoSyncRunOutcome {
  pendingChanges?: number;
  pendingDownloads?: number;
}

export interface CloudAutoSyncTimerAdapter {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface CloudAutoSyncCoordinatorOptions {
  run(context: CloudAutoSyncRunContext): Promise<CloudAutoSyncRunOutcome | void>;
  enabled?: boolean;
  configured?: boolean;
  online?: boolean;
  initialStatus?: Partial<Pick<
    CloudAutoSyncStatus,
    | 'pendingChanges'
    | 'pendingDownloads'
    | 'lastSuccessAt'
    | 'lastErrorKey'
    | 'nextRetryAt'
  >>;
  /** Restore the persisted auth/config error latch across an app restart. */
  initialPermanentError?: boolean;
  pollIntervalMs?: number;
  debounceMs?: number;
  maxDebounceMs?: number;
  retryDelaysMs?: readonly number[];
  retryJitterRatio?: number;
  timer?: CloudAutoSyncTimerAdapter;
  now?: () => number;
  random?: () => number;
  classifyError?: (error: unknown) => CloudAutoSyncErrorKind;
  getErrorKey?: (error: unknown) => string;
  cancelActive?: () => void;
  onStatus?: (status: CloudAutoSyncStatus) => void;
}

const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 300_000] as const;

const DEFAULT_TIMER: CloudAutoSyncTimerAdapter = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as number),
};

function priority(origin: CloudSyncOrigin): number {
  switch (origin) {
    case 'manual':
      return 0;
    case 'auto':
      return 1;
    case 'background':
      return 2;
  }
}

function defaultErrorKey(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function normalizeTimestamp(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
}

type RunWaiter = {
  resolve: () => void;
  reject: (error: unknown) => void;
};

/**
 * Runtime-neutral scheduler for cloud synchronization.
 *
 * Platform code owns persistence, networking and filesystem work. This class
 * owns only timing and concurrency: one active job, a coalesced follow-up job,
 * trailing debounce with a maximum latency, chained polling, and retry backoff.
 */
export class CloudAutoSyncCoordinator {
  private readonly runCycle: CloudAutoSyncCoordinatorOptions['run'];

  private readonly pollIntervalMs: number;

  private readonly debounceMs: number;

  private readonly maxDebounceMs: number;

  private readonly retryDelaysMs: readonly number[];

  private readonly retryJitterRatio: number;

  private readonly timer: CloudAutoSyncTimerAdapter;

  private readonly now: () => number;

  private readonly random: () => number;

  private readonly classifyError: (error: unknown) => CloudAutoSyncErrorKind;

  private readonly getErrorKey: (error: unknown) => string;

  private readonly cancelActiveCallback: (() => void) | undefined;

  private readonly onStatus: ((status: CloudAutoSyncStatus) => void) | undefined;

  private status: CloudAutoSyncStatus;

  private started = false;

  private online: boolean;

  private blockedByPermanentError = false;

  private retryIndex = 0;

  private firstDirtyAt: number | null = null;

  private pollTimer: unknown | null = null;

  private debounceTimer: unknown | null = null;

  private retryTimer: unknown | null = null;

  private runningLoop: Promise<void> | null = null;

  private activeOrigin: CloudSyncOrigin | null = null;

  private requestedOrigin: CloudSyncOrigin | null = null;

  private requestedWaiters: RunWaiter[] = [];

  constructor(options: CloudAutoSyncCoordinatorOptions) {
    this.runCycle = options.run;
    this.pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 10_000);
    this.debounceMs = Math.max(0, options.debounceMs ?? 2_000);
    this.maxDebounceMs = Math.max(this.debounceMs, options.maxDebounceMs ?? 10_000);
    this.retryDelaysMs = options.retryDelaysMs?.length
      ? options.retryDelaysMs.map((value) => Math.max(0, value))
      : DEFAULT_RETRY_DELAYS_MS;
    this.retryJitterRatio = Math.min(1, Math.max(0, options.retryJitterRatio ?? 0.15));
    this.timer = options.timer ?? DEFAULT_TIMER;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.classifyError = options.classifyError ?? (() => 'transient');
    this.getErrorKey = options.getErrorKey ?? defaultErrorKey;
    this.cancelActiveCallback = options.cancelActive;
    this.onStatus = options.onStatus;
    const enabled = options.enabled ?? true;
    const configured = options.configured ?? false;
    const online = options.online ?? true;
    const initialStatus = options.initialStatus;
    const initialRetryAt = normalizeTimestamp(initialStatus?.nextRetryAt);
    this.blockedByPermanentError = Boolean(
      options.initialPermanentError && enabled && configured,
    );
    this.online = online;
    this.status = {
      enabled,
      configured,
      state: !enabled
        ? 'disabled'
        : !configured
          ? 'unconfigured'
          : !online
            ? 'offline'
            : this.blockedByPermanentError
              ? 'error'
              : initialRetryAt != null && initialRetryAt > this.now()
                ? 'backing-off'
                : 'idle',
      pendingChanges: normalizeCount(initialStatus?.pendingChanges),
      pendingDownloads: normalizeCount(initialStatus?.pendingDownloads),
      lastSuccessAt: normalizeTimestamp(initialStatus?.lastSuccessAt),
      lastErrorKey: typeof initialStatus?.lastErrorKey === 'string'
        && initialStatus.lastErrorKey.length > 0
        ? initialStatus.lastErrorKey
        : null,
      nextRetryAt: !this.blockedByPermanentError
        && initialRetryAt != null
        && initialRetryAt > this.now()
        ? initialRetryAt
        : null,
    };
  }

  start(runImmediately = true): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.emitStatus();
    if (this.status.nextRetryAt != null && this.canRunAutomatically()) {
      this.resumePersistedRetry();
    } else if (runImmediately && this.canRunAutomatically()) {
      this.fireAndForget('auto');
    } else {
      this.schedulePoll();
    }
  }

  stop(): void {
    this.started = false;
    this.clearAllTimers();
    this.firstDirtyAt = null;
    this.dropRequestedAutomaticRuns(new Error('cloudAutoSyncStopped'));
    if (this.activeOrigin !== 'manual') {
      this.cancelActiveCallback?.();
    }
  }

  getStatus(): CloudAutoSyncStatus {
    return { ...this.status };
  }

  setPendingCounts(pendingChanges: number, pendingDownloads = this.status.pendingDownloads): void {
    this.updateStatus({
      pendingChanges: Math.max(0, Math.trunc(pendingChanges)),
      pendingDownloads: Math.max(0, Math.trunc(pendingDownloads)),
    });
  }

  setEnabled(enabled: boolean): void {
    if (this.status.enabled === enabled) {
      return;
    }
    this.updateStatus({ enabled, lastErrorKey: enabled ? null : this.status.lastErrorKey });
    this.blockedByPermanentError = false;
    this.retryIndex = 0;
    this.clearAllTimers();
    this.firstDirtyAt = null;

    if (!enabled) {
      this.dropRequestedAutomaticRuns(new Error('cloudAutoSyncDisabled'));
      if (this.activeOrigin !== 'manual') {
        this.cancelActiveCallback?.();
      }
      this.updateStatus({ state: 'disabled', nextRetryAt: null });
      return;
    }

    this.updateDerivedIdleState();
    if (this.started && this.canRunAutomatically()) {
      this.fireAndForget('auto');
    }
  }

  setConfigured(configured: boolean): void {
    this.applyConfiguration(configured, false);
  }

  /**
   * Re-evaluate credentials/endpoints even when the configuration remains
   * structurally "configured". This is the recovery path after an auth or
   * bucket error: saving a corrected secret must clear the permanent-error
   * latch and retry without requiring a separate manual sync.
   */
  notifyConfigurationChanged(configured: boolean): void {
    this.applyConfiguration(configured, true);
  }

  private applyConfiguration(configured: boolean, forceRetry: boolean): void {
    if (this.status.configured === configured && !forceRetry) {
      return;
    }
    this.updateStatus({ configured, lastErrorKey: null });
    this.blockedByPermanentError = false;
    this.retryIndex = 0;
    this.clearRetryTimer();

    if (!configured) {
      this.clearPollTimer();
      this.clearDebounceTimer();
      this.dropRequestedAutomaticRuns(new Error('cloudAutoSyncUnconfigured'));
      if (this.activeOrigin !== 'manual') {
        this.cancelActiveCallback?.();
      }
      this.updateStatus({ state: this.status.enabled ? 'unconfigured' : 'disabled' });
      return;
    }

    this.updateDerivedIdleState();
    if (this.started && this.canRunAutomatically()) {
      this.fireAndForget('auto');
    }
  }

  setOnline(online: boolean): void {
    if (online === this.online) {
      return;
    }
    this.online = online;

    if (!online) {
      this.clearPollTimer();
      this.clearRetryTimer();
      if (this.activeOrigin !== 'manual') {
        this.cancelActiveCallback?.();
      }
      this.updateStatus({ state: this.status.enabled && this.status.configured ? 'offline' : this.baseIdleState() });
      return;
    }

    this.updateDerivedIdleState();
    if (this.started && this.canRunAutomatically()) {
      this.fireAndForget('auto');
    }
  }

  /** Queue an automatic upload after a burst of local database mutations. */
  markLocalChange(pendingChanges?: number): void {
    this.updateStatus({
      pendingChanges: pendingChanges == null
        ? this.status.pendingChanges + 1
        : Math.max(0, Math.trunc(pendingChanges)),
    });
    if (!this.started || !this.canRunAutomatically()) {
      return;
    }

    // A new local mutation is useful evidence that a transient failure may have
    // cleared, so restart the short retry sequence instead of waiting five minutes.
    this.clearRetryTimer();
    this.retryIndex = 0;
    const now = this.now();
    this.firstDirtyAt ??= now;
    const elapsed = Math.max(0, now - this.firstDirtyAt);
    const remainingMaximum = Math.max(0, this.maxDebounceMs - elapsed);
    const delay = Math.min(this.debounceMs, remainingMaximum);
    this.clearDebounceTimer();
    this.debounceTimer = this.timer.setTimeout(() => {
      this.debounceTimer = null;
      this.firstDirtyAt = null;
      this.fireAndForget('auto');
    }, delay);
  }

  /** Manual runs remain available even while automatic synchronization is disabled. */
  runNow(origin: CloudSyncOrigin = 'manual'): Promise<void> {
    if (!this.status.configured) {
      return Promise.reject(new Error('cloudAutoSyncUnconfigured'));
    }
    if (!this.online) {
      return Promise.reject(new Error('cloudAutoSyncOffline'));
    }
    if (origin !== 'manual' && (!this.started || !this.canRunAutomatically())) {
      return Promise.resolve();
    }

    if (origin === 'manual') {
      this.blockedByPermanentError = false;
      this.retryIndex = 0;
      this.clearRetryTimer();
    }
    return this.enqueueRun(origin);
  }

  cancelActive(): void {
    this.cancelActiveCallback?.();
  }

  private enqueueRun(origin: CloudSyncOrigin): Promise<void> {
    if (!this.requestedOrigin || priority(origin) < priority(this.requestedOrigin)) {
      this.requestedOrigin = origin;
    }

    const promise = new Promise<void>((resolve, reject) => {
      this.requestedWaiters.push({ resolve, reject });
    });
    this.ensureDrainLoop();
    return promise;
  }

  private ensureDrainLoop(): void {
    if (this.runningLoop) {
      return;
    }

    // Reserve the single-flight slot before drainRuns executes. Both runCycle
    // and onStatus are application callbacks and may synchronously request a
    // follow-up run; without the reservation that re-entrancy could start a
    // second drain before its Promise was assigned to runningLoop.
    this.runningLoop = Promise.resolve();
    const loop = this.drainRuns();
    this.runningLoop = loop;
    void loop.then(
      () => this.finishDrainLoop(loop),
      () => this.finishDrainLoop(loop),
    );
  }

  private finishDrainLoop(loop: Promise<void>): void {
    if (this.runningLoop !== loop) {
      return;
    }
    this.runningLoop = null;

    // A request can arrive after drainRuns observes an empty queue but before
    // this completion callback runs. Always re-check instead of relying on a
    // fixed number of follow-up drains.
    if (this.requestedOrigin) {
      this.ensureDrainLoop();
    } else {
      this.schedulePoll();
    }
  }

  private async drainRuns(): Promise<void> {
    while (this.requestedOrigin) {
      const origin = this.requestedOrigin;
      const waiters = this.requestedWaiters;
      this.requestedOrigin = null;
      this.requestedWaiters = [];
      this.activeOrigin = origin;
      this.clearPollTimer();
      this.clearDebounceTimer();
      // A manual recovery can already be queued when the preceding automatic
      // cycle fails and arms its transient retry. Cancel that stale retry when
      // the manual cycle actually starts; if the manual cycle also fails it
      // will schedule a fresh retry with the correct backoff state.
      if (origin === 'manual') {
        this.clearRetryTimer();
      }
      this.firstDirtyAt = null;
      this.updateStatus({ state: 'syncing', nextRetryAt: null });

      try {
        const outcome = await this.runCycle({ origin });
        this.retryIndex = 0;
        this.blockedByPermanentError = false;
        this.updateStatus({
          state: this.baseIdleState(),
          pendingChanges: outcome?.pendingChanges ?? this.status.pendingChanges,
          pendingDownloads: outcome?.pendingDownloads ?? this.status.pendingDownloads,
          lastSuccessAt: this.now(),
          lastErrorKey: null,
          nextRetryAt: null,
        });
        for (const waiter of waiters) waiter.resolve();
      } catch (error) {
        const kind = this.classifyError(error);
        if (kind === 'cancelled') {
          this.updateStatus({ state: this.baseIdleState(), nextRetryAt: null });
        } else if (kind === 'permanent') {
          this.blockedByPermanentError = true;
          this.updateStatus({
            state: 'error',
            lastErrorKey: this.getErrorKey(error),
            nextRetryAt: null,
          });
        } else {
          this.updateStatus({ lastErrorKey: this.getErrorKey(error) });
          this.scheduleRetry();
        }
        for (const waiter of waiters) waiter.reject(error);

        // Do not turn a stream of automatic events into an immediate failure
        // loop. A queued manual recovery is still allowed to run right away.
        // If an automatic run was aborted by suspend/offline and the app has
        // already resumed before that Promise settles, preserve the newly
        // queued resume run instead of delaying recovery until the next poll.
        const keepResumedAutomaticRun = kind === 'cancelled'
          && this.activeOrigin !== 'manual'
          && this.canRunAutomatically();
        if (this.requestedOrigin !== 'manual' && !keepResumedAutomaticRun) {
          this.dropRequestedAutomaticRuns(error);
        }
      } finally {
        this.activeOrigin = null;
      }
    }
  }

  private scheduleRetry(): void {
    if (!this.started || !this.status.enabled || !this.status.configured || !this.online) {
      this.updateDerivedIdleState();
      return;
    }
    this.clearRetryTimer();
    const baseDelay = this.retryDelaysMs[Math.min(this.retryIndex, this.retryDelaysMs.length - 1)] ?? 0;
    this.retryIndex = Math.min(this.retryIndex + 1, this.retryDelaysMs.length - 1);
    const jitterMultiplier = 1 + ((this.random() * 2 - 1) * this.retryJitterRatio);
    const delay = Math.max(0, Math.round(baseDelay * jitterMultiplier));
    const nextRetryAt = this.now() + delay;
    this.updateStatus({ state: 'backing-off', nextRetryAt });
    this.retryTimer = this.timer.setTimeout(() => {
      this.retryTimer = null;
      this.updateStatus({ nextRetryAt: null });
      this.fireAndForget('auto');
    }, delay);
  }

  private resumePersistedRetry(): void {
    const retryAt = this.status.nextRetryAt;
    if (retryAt == null || !this.canRunAutomatically()) {
      return;
    }
    const delay = Math.max(0, retryAt - this.now());
    this.updateStatus({ state: 'backing-off', nextRetryAt: retryAt });
    this.retryTimer = this.timer.setTimeout(() => {
      this.retryTimer = null;
      this.updateStatus({ nextRetryAt: null });
      this.fireAndForget('auto');
    }, delay);
  }

  private schedulePoll(): void {
    if (
      this.pollTimer
      || this.debounceTimer
      || this.retryTimer
      || this.runningLoop
      || !this.canRunAutomatically()
    ) {
      return;
    }
    this.pollTimer = this.timer.setTimeout(() => {
      this.pollTimer = null;
      this.fireAndForget('auto');
    }, this.pollIntervalMs);
  }

  private fireAndForget(origin: CloudSyncOrigin): void {
    void this.runNow(origin).catch(() => {
      // Status and retry behavior are handled inside drainRuns.
    });
  }

  private canRunAutomatically(): boolean {
    return this.started
      && this.status.enabled
      && this.status.configured
      && this.online
      && !this.blockedByPermanentError;
  }

  private baseIdleState(): CloudAutoSyncStatus['state'] {
    if (!this.status.enabled) return 'disabled';
    if (!this.status.configured) return 'unconfigured';
    if (!this.online) return 'offline';
    if (this.blockedByPermanentError) return 'error';
    return 'idle';
  }

  private updateDerivedIdleState(): void {
    this.updateStatus({ state: this.baseIdleState(), nextRetryAt: null });
    this.schedulePoll();
  }

  private dropRequestedAutomaticRuns(error: unknown): void {
    if (this.requestedOrigin === 'manual') {
      return;
    }
    this.requestedOrigin = null;
    const waiters = this.requestedWaiters;
    this.requestedWaiters = [];
    for (const waiter of waiters) waiter.reject(error);
  }

  private clearAllTimers(): void {
    this.clearPollTimer();
    this.clearDebounceTimer();
    this.clearRetryTimer();
  }

  private clearPollTimer(): void {
    if (this.pollTimer != null) {
      this.timer.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimer != null) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer != null) {
      this.timer.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.status.nextRetryAt != null) {
      this.updateStatus({ nextRetryAt: null });
    }
  }

  private updateStatus(changes: Partial<CloudAutoSyncStatus>): void {
    this.status = { ...this.status, ...changes };
    this.emitStatus();
  }

  private emitStatus(): void {
    try {
      this.onStatus?.(this.getStatus());
    } catch {
      // Status observers persist or broadcast a snapshot, but they are not
      // part of the synchronization transaction. An observer failure must not
      // escape from updateStatus(), strand run waiters, or stop future polls.
    }
  }
}
