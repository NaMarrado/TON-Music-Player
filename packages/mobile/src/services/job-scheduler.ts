import {
  MAX_CONCURRENT_DOWNLOADS,
  ResourceJobScheduler,
  type JobKind,
  type JobPriority,
  type QueueNotice,
  type ResourceJobLease,
  type ResourceLane,
} from '@ton/core';

const scheduler = new ResourceJobScheduler({
  'cpu-heavy': 1,
  'archive-io': 1,
  metadata: 1,
  network: MAX_CONCURRENT_DOWNLOADS,
});

export function scheduleMobileJob<T>(options: {
  kind: JobKind;
  lane: ResourceLane;
  priority?: JobPriority;
  onQueued?: (notice: QueueNotice) => void;
  run: () => Promise<T> | T;
}): Promise<T> {
  return scheduler.schedule(options);
}

export function acquireMobileJob(options: {
  kind: JobKind;
  lane: ResourceLane;
  priority?: JobPriority;
  onQueued?: (notice: QueueNotice) => void;
}): ResourceJobLease {
  return scheduler.acquire(options);
}
