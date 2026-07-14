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

test('coordinator is single-flight and coalesces an in-flight request into one follow-up', async () => {
  const timer = new FakeTimer();
  const resolvers: Array<() => void> = [];
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    run: async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      active -= 1;
      return { pendingChanges: 0 };
    },
  });
  coordinator.start(false);
  const first = coordinator.runNow('manual');
  const second = coordinator.runNow('manual');
  await flushPromises();
  assert.equal(calls, 1);
  resolvers.shift()?.();
  await first;
  await flushPromises();
  assert.equal(calls, 2);
  resolvers.shift()?.();
  await second;
  assert.equal(maximumActive, 1);
});
test('coordinator reserves single-flight before synchronous status callbacks can re-enter', async () => {
  const resolvers: Array<() => void> = [];
  let followUp: Promise<void> | null = null;
  let requestedFollowUp = false;
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    onStatus: (status) => {
      if (status.state === 'syncing' && !requestedFollowUp) {
        requestedFollowUp = true;
        followUp = coordinator.runNow('manual');
      }
    },
    run: async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => resolvers.push(resolve));
      active -= 1;
    },
  });
  coordinator.start(false);
  const first = coordinator.runNow('manual');
  assert.equal(calls, 1);
  assert.equal(maximumActive, 1);
  resolvers.shift()?.();
  await first;
  await flushPromises();
  assert.equal(calls, 2);
  assert.equal(maximumActive, 1);
  resolvers.shift()?.();
  await followUp;
  coordinator.stop();
});

test('status observer exceptions cannot strand coordinator waiters or state', async () => {
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    onStatus: () => {
      throw new Error('observer failed');
    },
    run: async () => {
      calls += 1;
      return { pendingChanges: 0 };
    },
  });

  assert.doesNotThrow(() => coordinator.start(false));
  await coordinator.runNow('manual');
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'idle');
  coordinator.stop();
});

test('coordinator hydrates persisted status and resumes a future retry deadline', async () => {
  const timer = new FakeTimer();
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    initialStatus: {
      pendingChanges: 4,
      pendingDownloads: 2,
      lastSuccessAt: 100,
      lastErrorKey: 'cloudStorageErrorNetwork',
      nextRetryAt: 5_000,
    },
    run: async () => {
      calls += 1;
      return { pendingChanges: 0, pendingDownloads: 0 };
    },
  });
  coordinator.start();
  assert.deepEqual(coordinator.getStatus(), {
    enabled: true,
    configured: true,
    state: 'backing-off',
    pendingChanges: 4,
    pendingDownloads: 2,
    lastSuccessAt: 100,
    lastErrorKey: 'cloudStorageErrorNetwork',
    nextRetryAt: 5_000,
  });
  await timer.advance(4_999);
  assert.equal(calls, 0);
  await timer.advance(1);
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().lastErrorKey, null);
  coordinator.stop();
});

test('coordinator restores a persisted permanent-error latch without a startup request', async () => {
  const clock = new FakeTimer();
  let runs = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    timer: clock,
    now: () => clock.now,
    enabled: true,
    configured: true,
    online: true,
    initialPermanentError: true,
    initialStatus: {
      lastErrorKey: 'cloudStorageErrorAccessDenied',
      nextRetryAt: clock.now + 5_000,
    },
    run: async () => {
      runs += 1;
    },
  });

  coordinator.start(true);
  await flushPromises();
  assert.equal(runs, 0);
  assert.equal(coordinator.getStatus().state, 'error');
  assert.equal(coordinator.getStatus().nextRetryAt, null);

  coordinator.setOnline(false);
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(runs, 0);
  assert.equal(coordinator.getStatus().state, 'error');

  coordinator.notifyConfigurationChanged(true);
  await flushPromises();
  assert.equal(runs, 1);
});

test('manual sync remains available while automatic sync is disabled', async () => {
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: false,
    configured: true,
    run: async ({ origin }) => {
      calls += 1;
      assert.equal(origin, 'manual');
      return { pendingChanges: 0 };
    },
  });
  coordinator.start();
  await flushPromises();
  assert.equal(calls, 0);
  assert.equal(coordinator.getStatus().state, 'disabled');
  await coordinator.runNow('manual');
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'disabled');
  coordinator.stop();
});

test('enabling automatic sync and restoring network trigger an immediate run', async () => {
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: false,
    configured: true,
    online: false,
    run: async () => {
      calls += 1;
    },
  });
  coordinator.start();
  coordinator.setEnabled(true);
  await flushPromises();
  assert.equal(calls, 0);
  assert.equal(coordinator.getStatus().state, 'offline');
  coordinator.setOnline(true);
  await flushPromises();
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'idle');
  coordinator.stop();
});

test('local changes use a 2 second trailing debounce capped at 10 seconds', async () => {
  const timer = new FakeTimer();
  const callTimes: number[] = [];
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true,
    configured: true,
    timer,
    now: () => timer.now,
    pollIntervalMs: 100_000,
    retryJitterRatio: 0,
    run: async () => {
      callTimes.push(timer.now);
      return { pendingChanges: 0 };
    },
  });
  coordinator.start(false);
  coordinator.markLocalChange();
  for (let index = 0; index < 6; index += 1) {
    await timer.advance(1_500);
    coordinator.markLocalChange();
  }
  assert.deepEqual(callTimes, []);
  await timer.advance(1_000);
  assert.deepEqual(callTimes, [10_000]);
});
