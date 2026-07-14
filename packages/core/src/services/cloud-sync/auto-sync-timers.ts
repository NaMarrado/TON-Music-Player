import type { CloudAutoSyncTimerAdapter } from './auto-sync-coordinator-types';

type TimerSlot = 'poll' | 'debounce' | 'retry';

export class CloudAutoSyncTimers {
  private readonly handles: Record<TimerSlot, unknown | null> = {
    poll: null,
    debounce: null,
    retry: null,
  };

  constructor(private readonly timer: CloudAutoSyncTimerAdapter) {}

  get hasPoll(): boolean {
    return this.handles.poll != null;
  }

  get hasDebounce(): boolean {
    return this.handles.debounce != null;
  }

  get hasRetry(): boolean {
    return this.handles.retry != null;
  }

  set(slot: TimerSlot, callback: () => void, delayMs: number): void {
    this.clear(slot);
    this.handles[slot] = this.timer.setTimeout(() => {
      this.handles[slot] = null;
      callback();
    }, delayMs);
  }

  clear(slot: TimerSlot): void {
    const handle = this.handles[slot];
    if (handle != null) {
      this.timer.clearTimeout(handle);
      this.handles[slot] = null;
    }
  }

  clearAll(): void {
    this.clear('poll');
    this.clear('debounce');
    this.clear('retry');
  }
}

export class CloudAutoSyncRetryPolicy {
  private index = 0;

  constructor(
    private readonly delaysMs: readonly number[],
    private readonly jitterRatio: number,
    private readonly random: () => number,
  ) {}

  reset(): void {
    this.index = 0;
  }

  nextDelay(): number {
    const baseDelay = this.delaysMs[Math.min(this.index, this.delaysMs.length - 1)] ?? 0;
    this.index = Math.min(this.index + 1, this.delaysMs.length - 1);
    const jitterMultiplier = 1 + ((this.random() * 2 - 1) * this.jitterRatio);
    return Math.max(0, Math.round(baseDelay * jitterMultiplier));
  }
}
