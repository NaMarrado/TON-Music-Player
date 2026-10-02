import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudAutoSyncCoordinator } from '../../../packages/core/src/services/cloud-sync/auto-sync-coordinator.ts';
import type { CloudAutoSyncTimerAdapter } from '../../../packages/core/src/services/cloud-sync/auto-sync-coordinator-types.ts';

class Timer implements CloudAutoSyncTimerAdapter {
  now = 0;
  private nextId = 0;
  private tasks: Array<{ id: number; at: number; callback: () => void }> = [];
  setTimeout(callback: () => void, delay: number) {
    const id = ++this.nextId;
    this.tasks.push({ id, at: this.now + delay, callback });
    return id;
  }
  clearTimeout(id: unknown) { this.tasks = this.tasks.filter((task) => task.id !== id); }
  async advance(delay: number) {
    const target = this.now + delay;
    while (true) {
      this.tasks.sort((a, b) => a.at - b.at || a.id - b.id);
      const task = this.tasks[0];
      if (!task || task.at > target) break;
      this.tasks.shift(); this.now = task.at; task.callback();
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    }
    this.now = target;
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  }
}

test('going offline drops a queued automatic run, while reconnecting publishes the pending generation', async () => {
  const timer = new Timer();
  let finish: () => void = () => { throw new Error('run not started'); };
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true, configured: true, timer, now: () => timer.now,
    run: async () => { calls += 1; await new Promise<void>((resolve) => { finish = resolve; }); },
  });
  coordinator.start(false);
  const active = coordinator.runNow('auto');
  const queued = coordinator.runNow('auto');
  const rejected = assert.rejects(queued, /cloudAutoSyncOffline/);
  coordinator.markLocalChange(1);
  coordinator.setOnline(false);
  await rejected; finish(); await active; await timer.advance(20_000);
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'offline');
  assert.equal(coordinator.getStatus().pendingChanges, 1);
  coordinator.setOnline(true);
  assert.equal(calls, 2);
  finish(); await timer.advance(0); coordinator.stop();
});

test('a dirty debounce scheduled during a failed run cannot bypass the configured retry backoff', async () => {
  const timer = new Timer();
  let fail: (error: Error) => void = () => { throw new Error('run not started'); };
  let calls = 0;
  const coordinator = new CloudAutoSyncCoordinator({
    enabled: true, configured: true, timer, now: () => timer.now,
    debounceMs: 2_000, retryDelaysMs: [5_000], retryJitterRatio: 0,
    run: async () => {
      calls += 1;
      if (calls === 1) await new Promise<void>((_resolve, reject) => { fail = reject; });
      return { pendingChanges: 0 };
    },
  });
  coordinator.start(false);
  const active = coordinator.runNow('auto');
  const rejected = assert.rejects(active, /transient/);
  coordinator.markLocalChange(1); fail(new Error('transient'));
  await rejected; await timer.advance(2_000);
  assert.equal(calls, 1);
  assert.equal(coordinator.getStatus().state, 'backing-off');
  assert.equal(coordinator.getStatus().nextRetryAt, 5_000);
  await timer.advance(3_000);
  assert.equal(calls, 2);
  assert.equal(coordinator.getStatus().state, 'idle');
  assert.equal(coordinator.getStatus().pendingChanges, 0);
  assert.equal(coordinator.getStatus().nextRetryAt, null);
  coordinator.stop();
});
