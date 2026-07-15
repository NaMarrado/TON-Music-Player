import type { CloudSyncOrigin } from '../../types/cloud-sync';
import type {
  CloudAutoSyncRunOutcome,
  CloudAutoSyncRunContext,
} from './auto-sync-coordinator-types';

type RunWaiter = { resolve: () => void; reject: (error: unknown) => void };

interface CloudAutoSyncRunQueueCallbacks {
  run(context: CloudAutoSyncRunContext): Promise<CloudAutoSyncRunOutcome | void>;
  beforeRun(origin: CloudSyncOrigin): void;
  afterSuccess(outcome: CloudAutoSyncRunOutcome | void): void;
  afterFailure(error: unknown, origin: CloudSyncOrigin): boolean;
  afterRun(): void;
  onIdle(): void;
}

function priority(origin: CloudSyncOrigin): number {
  switch (origin) {
    case 'manual': return 0;
    case 'auto': return 1;
    case 'background': return 2;
  }
}

export class CloudAutoSyncRunQueue {
  private runningLoop: Promise<void> | null = null;

  private currentOrigin: CloudSyncOrigin | null = null;

  private requestedOrigin: CloudSyncOrigin | null = null;

  private requestedWaiters: RunWaiter[] = [];

  constructor(private readonly callbacks: CloudAutoSyncRunQueueCallbacks) {}

  get activeOrigin(): CloudSyncOrigin | null {
    return this.currentOrigin;
  }

  get isRunning(): boolean {
    return this.runningLoop != null;
  }

  enqueue(origin: CloudSyncOrigin): Promise<void> {
    if (!this.requestedOrigin || priority(origin) < priority(this.requestedOrigin)) {
      this.requestedOrigin = origin;
    }
    const promise = new Promise<void>((resolve, reject) => {
      this.requestedWaiters.push({ resolve, reject });
    });
    this.ensureDrainLoop();
    return promise;
  }

  dropAutomatic(error: unknown): void {
    if (this.requestedOrigin === 'manual') return;
    this.requestedOrigin = null;
    const waiters = this.requestedWaiters;
    this.requestedWaiters = [];
    for (const waiter of waiters) waiter.reject(error);
  }

  private ensureDrainLoop(): void {
    if (this.runningLoop) return;
    // Reserve before callbacks can synchronously enqueue a follow-up run.
    this.runningLoop = Promise.resolve();
    const loop = this.drainRuns();
    this.runningLoop = loop;
    void loop.then(() => this.finishDrainLoop(loop), () => this.finishDrainLoop(loop));
  }

  private finishDrainLoop(loop: Promise<void>): void {
    if (this.runningLoop !== loop) return;
    this.runningLoop = null;
    if (this.requestedOrigin) this.ensureDrainLoop();
    else this.callbacks.onIdle();
  }

  private async drainRuns(): Promise<void> {
    while (this.requestedOrigin) {
      const origin = this.requestedOrigin;
      const waiters = this.requestedWaiters;
      this.requestedOrigin = null;
      this.requestedWaiters = [];
      this.currentOrigin = origin;
      this.callbacks.beforeRun(origin);
      try {
        const outcome = await this.callbacks.run({ origin });
        this.callbacks.afterSuccess(outcome);
        for (const waiter of waiters) waiter.resolve();
      } catch (error) {
        const preserveAutomatic = this.callbacks.afterFailure(error, origin);
        for (const waiter of waiters) waiter.reject(error);
        if (this.requestedOrigin !== 'manual' && !preserveAutomatic) {
          this.dropAutomatic(error);
        }
      } finally {
        this.currentOrigin = null;
        this.callbacks.afterRun();
      }
    }
  }
}
