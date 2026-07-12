export type JobKind =
  | 'library-scan'
  | 'track-metadata'
  | 'loudness-analysis'
  | 'library-import'
  | 'library-export'
  | 'playlist-import'
  | 'playlist-export'
  | 'cloud-sync'
  | 'download-resolve'
  | 'download-postprocess'
  | 'playlist-queue-import';

export type ResourceLane =
  | 'cpu-heavy'
  | 'archive-io'
  | 'metadata'
  | 'network'
  | 'light';

export type JobPriority =
  | 'user-blocking'
  | 'user-visible'
  | 'background';

export type ResourceLaneLimits = Partial<Record<ResourceLane, number>>;

export type QueueNotice = {
  kind: JobKind;
  lane: ResourceLane;
  position: number;
  running: number;
};

export type ResourceJobLease = {
  started: Promise<boolean>;
  release: () => void;
  cancelQueued: () => boolean;
  isActive: () => boolean;
};

type ScheduledJob<T> = {
  id: number;
  kind: JobKind;
  lane: ResourceLane;
  priority: JobPriority;
  run: () => Promise<T> | T;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  onQueued?: (notice: QueueNotice) => void;
};

type AcquiredJob = {
  id: number;
  kind: JobKind;
  lane: ResourceLane;
  priority: JobPriority;
  onQueued?: (notice: QueueNotice) => void;
  resolveStarted: (started: boolean) => void;
  state: 'queued' | 'active' | 'released';
};

type QueuedJob = ScheduledJob<unknown> | AcquiredJob;

const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  'user-blocking': 0,
  'user-visible': 1,
  background: 2,
};

export class ResourceJobScheduler {
  private readonly limits: Record<ResourceLane, number>;

  private readonly runningByLane: Record<ResourceLane, number> = {
    'cpu-heavy': 0,
    'archive-io': 0,
    metadata: 0,
    network: 0,
    light: 0,
  };

  private readonly queueByLane: Record<ResourceLane, QueuedJob[]> = {
    'cpu-heavy': [],
    'archive-io': [],
    metadata: [],
    network: [],
    light: [],
  };

  private nextJobId = 1;

  constructor(limits: ResourceLaneLimits = {}) {
    this.limits = {
      'cpu-heavy': limits['cpu-heavy'] ?? 1,
      'archive-io': limits['archive-io'] ?? 1,
      metadata: limits.metadata ?? 1,
      network: limits.network ?? 1,
      light: limits.light ?? Number.POSITIVE_INFINITY,
    };
  }

  schedule<T>(options: {
    kind: JobKind;
    lane: ResourceLane;
    priority?: JobPriority;
    run: () => Promise<T> | T;
    onQueued?: (notice: QueueNotice) => void;
  }): Promise<T> {
    const lease = this.acquire({
      kind: options.kind,
      lane: options.lane,
      priority: options.priority,
      onQueued: options.onQueued,
    });

    return new Promise<T>((resolve, reject) => {
      void lease.started
        .then((started) => {
          if (!started) {
            reject(new Error('Job was cancelled before it started'));
            return;
          }

          return Promise.resolve(options.run())
            .then(resolve)
            .catch(reject)
            .finally(() => {
              lease.release();
            });
        })
        .catch(reject);
    });
  }

  acquire(options: {
    kind: JobKind;
    lane: ResourceLane;
    priority?: JobPriority;
    onQueued?: (notice: QueueNotice) => void;
  }): ResourceJobLease {
    let resolveStarted!: (started: boolean) => void;
    const started = new Promise<boolean>((resolve) => {
      resolveStarted = resolve;
    });

    const job: AcquiredJob = {
      id: this.nextJobId++,
      kind: options.kind,
      lane: options.lane,
      priority: options.priority ?? 'user-visible',
      onQueued: options.onQueued,
      resolveStarted,
      state: 'queued',
    };

    if (this.hasCapacity(job.lane) && this.queueByLane[job.lane].length === 0) {
      this.activate(job);
    } else {
      const queue = this.queueByLane[job.lane];
      queue.push(job);
      queue.sort((left, right) => {
        const priorityDelta = PRIORITY_WEIGHT[left.priority] - PRIORITY_WEIGHT[right.priority];
        return priorityDelta !== 0 ? priorityDelta : left.id - right.id;
      });

      const position = queue.findIndex((queued) => queued.id === job.id);
      job.onQueued?.({
        kind: job.kind,
        lane: job.lane,
        position: position < 0 ? 0 : position,
        running: this.runningByLane[job.lane],
      });
    }

    return {
      started,
      release: () => {
        if (job.state !== 'active') {
          return;
        }

        job.state = 'released';
        this.runningByLane[job.lane] = Math.max(0, this.runningByLane[job.lane] - 1);
        this.startNext(job.lane);
      },
      cancelQueued: () => {
        if (job.state !== 'queued') {
          return false;
        }

        const queue = this.queueByLane[job.lane];
        const index = queue.findIndex((queued) => queued.id === job.id);
        if (index < 0) {
          return false;
        }

        queue.splice(index, 1);
        job.state = 'released';
        job.resolveStarted(false);
        return true;
      },
      isActive: () => job.state === 'active',
    };
  }

  private hasCapacity(lane: ResourceLane): boolean {
    return this.runningByLane[lane] < this.limits[lane];
  }

  private activate(job: AcquiredJob): void {
    if (job.state !== 'queued') {
      return;
    }

    job.state = 'active';
    this.runningByLane[job.lane] += 1;
    job.resolveStarted(true);
  }

  private start<T>(job: ScheduledJob<T>): void {
    this.runningByLane[job.lane] += 1;

    void Promise.resolve(job.run())
      .then((value) => {
        job.resolve(value);
      })
      .catch((error) => {
        job.reject(error);
      })
      .finally(() => {
        this.runningByLane[job.lane] = Math.max(0, this.runningByLane[job.lane] - 1);
        this.startNext(job.lane);
      });
  }

  private startNext(lane: ResourceLane): void {
    if (!this.hasCapacity(lane)) {
      return;
    }

    const next = this.queueByLane[lane].shift();
    if (!next) {
      return;
    }

    if (!('run' in next)) {
      this.activate(next);
      return;
    }

    this.start(next);
  }
}
