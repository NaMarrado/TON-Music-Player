import {
  MAX_CONCURRENT_DOWNLOADS,
  ResourceJobScheduler,
  type JobKind,
  type JobPriority,
  type QueueNotice,
  type ResourceLane,
} from '@ton/core';

const scheduler = new ResourceJobScheduler({
  'archive-io': 1,
  'cpu-heavy': 1,
  metadata: 2,
  network: MAX_CONCURRENT_DOWNLOADS,
});

export function scheduleMainProcessJob<T>(options: {
  kind: JobKind;
  lane: ResourceLane;
  priority?: JobPriority;
  onQueued?: (notice: QueueNotice) => void;
  run: () => Promise<T> | T;
}): Promise<T> {
  return scheduler.schedule(options);
}
