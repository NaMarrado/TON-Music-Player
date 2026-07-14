import assert from 'node:assert/strict';
import test from 'node:test';
import type { CloudAutoSyncTimerAdapter } from '../../packages/core/src/index.ts';
import { CloudAutoSyncCoordinator } from '../../packages/core/src/index.ts';

type FakeTask = { id: number; at: number; callback: () => void };

class FakeTimer implements CloudAutoSyncTimerAdapter {
  now = 0;

  private nextId = 1;

  private tasks: FakeTask[] = [];

  setTimeout(callback: () => void, delayMs: number): unknown {
    const task = { id: this.nextId++, at: this.now + delayMs, callback };
    this.tasks.push(task);
    return task.id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks = this.tasks.filter((task) => task.id !== handle);
  }

  async advance(delayMs: number): Promise<void> {
    const target = this.now + delayMs;
    while (true) {
      this.tasks.sort((left, right) => left.at - right.at || left.id - right.id);
      const task = this.tasks[0];
      if (!task || task.at > target) break;
      this.tasks.shift();
      this.now = task.at;
      task.callback();
      await flushPromises();
    }
    this.now = target;
    await flushPromises();
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('poll is chained after completion and never overlaps a slow run', async () => {
  const timer = new FakeTimer();
  const resolvers: Array<() => void> = [];
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    pollIntervalMs: 10_000,
    run: async () => {
      calls += 1;
      await new Promise<void>((resolve) => resolvers.push(resolve));
    },
  });
  coordinator.start(false);
  await timer.advance(10_000);
  assert.equal(calls, 1);
  await timer.advance(20_000);
  assert.equal(calls, 1);
  resolvers.shift()?.();
  await flushPromises();
  await timer.advance(9_999);
  assert.equal(calls, 1);
  await timer.advance(1);
  assert.equal(calls, 2);
  coordinator.stop();
  resolvers.shift()?.();
});

test('transient errors back off while permanent errors pause until manual retry', async () => {
  const timer = new FakeTimer();
  let calls = 0;
  let permanent = false;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    retryDelaysMs: [5_000],
    retryJitterRatio: 0,
    classifyError: () => permanent ? 'permanent' : 'transient',
    run: async () => {
      calls += 1;
      throw new Error(permanent ? 'auth' : 'network');
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(coordinator.getStatus().state, 'backing-off');
  await timer.advance(4_999);
  assert.equal(calls, 1);
  permanent = true;
  await timer.advance(1);
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().state, 'error');
  await timer.advance(100_000);
  assert.equal(calls, 2);
  await assert.rejects(coordinator.runNow('manual'), /auth/);
  assert.equal(calls, 3);
});

test('a queued manual recovery cancels the preceding automatic retry timer', async () => {
  const timer = new FakeTimer();
  let calls = 0;
  let rejectFirst: ((error: Error) => void) | undefined;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    pollIntervalMs: 10_000,
    retryDelaysMs: [5_000],
    retryJitterRatio: 0,
    classifyError: () => 'transient',
    run: async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return { pendingChanges: 0 };
    },
  });

  coordinator.start(false);
  const automatic = coordinator.runNow('auto');
  await flushPromises();
  const manual = coordinator.runNow('manual');
  rejectFirst?.(new Error('network'));

  await assert.rejects(automatic, /network/);
  await manual;
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().nextRetryAt, null);

  await timer.advance(5_000);
  assert.equal(calls, 2);
  coordinator.stop();
});

test('saving corrected configuration clears a permanent error and retries automatically', async () => {
  let calls = 0;
  let credentialsValid = false;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    classifyError: () => 'permanent',
    run: async () => {
      calls += 1;
      if (!credentialsValid) {
        throw new Error('auth');
      }
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'error');

  credentialsValid = true;
  coordinator.setOnline(false);
  coordinator.notifyConfigurationChanged(true);
  await flushPromises();
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'offline');
  assert.equal(coordinator.getStatus().lastErrorKey, null);
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().state, 'idle');
  assert.equal(coordinator.getStatus().lastErrorKey, null);
  coordinator.stop();
});

test('a resume queued before an aborted automatic run settles is not lost', async () => {
  let calls = 0;
  let rejectActive: ((error: Error) => void) | null = null;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    online: true,
    classifyError: (error) => (
      error instanceof Error && error.message === 'aborted' ? 'cancelled' : 'transient'
    ),
    cancelActive: () => rejectActive?.(new Error('aborted')),
    run: async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((_resolve, reject) => {
          rejectActive = reject;
        });
      }
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(calls, 1);

  coordinator.setOnline(false);
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().state, 'idle');
  coordinator.stop();
});

test('cancel delegates to the platform and settles as cancelled without backoff', async () => {
  const timer = new FakeTimer();
  let rejectRun: ((error: Error) => void) | undefined;
  let cancels = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    classifyError: (error) => error instanceof Error && error.message === 'cancelled'
      ? 'cancelled'
      : 'transient',
    cancelActive: () => {
      cancels += 1;
      rejectRun?.(new Error('cancelled'));
    },
    run: () => new Promise((_, reject) => {
      rejectRun = reject;
    }),
  });
  coordinator.start(false);
  const run = coordinator.runNow('manual');
  await flushPromises();
  coordinator.cancelActive();
  await assert.rejects(run, /cancelled/);
  assert.equal(cancels, 1);
  assert.equal(coordinator.getStatus().state, 'idle');
  assert.equal(coordinator.getStatus().nextRetryAt, null);
});
