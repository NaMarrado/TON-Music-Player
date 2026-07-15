import type { CloudAutoSyncStatus } from '../../types/cloud-sync';
import type { CloudAutoSyncCoordinatorOptions } from './auto-sync-coordinator-types';
import {
  normalizeCloudAutoSyncCount,
  normalizeCloudAutoSyncTimestamp,
} from './auto-sync-coordinator-types';

export class CloudAutoSyncStateStore {
  private status: CloudAutoSyncStatus;

  private online: boolean;

  private blockedByPermanentError: boolean;

  private readonly onStatus: CloudAutoSyncCoordinatorOptions['onStatus'];

  constructor(options: CloudAutoSyncCoordinatorOptions, now: () => number) {
    const enabled = options.enabled ?? true;
    const configured = options.configured ?? false;
    this.online = options.online ?? true;
    const initialStatus = options.initialStatus;
    const initialRetryAt = normalizeCloudAutoSyncTimestamp(initialStatus?.nextRetryAt);
    this.blockedByPermanentError = Boolean(
      options.initialPermanentError && enabled && configured,
    );
    this.onStatus = options.onStatus;
    this.status = {
      enabled,
      configured,
      state: !enabled
        ? 'disabled'
        : !configured
          ? 'unconfigured'
          : !this.online
            ? 'offline'
            : this.blockedByPermanentError
              ? 'error'
              : initialRetryAt != null && initialRetryAt > now()
                ? 'backing-off'
                : 'idle',
      pendingChanges: normalizeCloudAutoSyncCount(initialStatus?.pendingChanges),
      pendingDownloads: normalizeCloudAutoSyncCount(initialStatus?.pendingDownloads),
      lastSuccessAt: normalizeCloudAutoSyncTimestamp(initialStatus?.lastSuccessAt),
      lastErrorKey: typeof initialStatus?.lastErrorKey === 'string'
        && initialStatus.lastErrorKey.length > 0
        ? initialStatus.lastErrorKey
        : null,
      nextRetryAt: !this.blockedByPermanentError
        && initialRetryAt != null
        && initialRetryAt > now()
        ? initialRetryAt
        : null,
    };
  }

  get value(): Readonly<CloudAutoSyncStatus> {
    return this.status;
  }

  get isOnline(): boolean {
    return this.online;
  }

  get isBlocked(): boolean {
    return this.blockedByPermanentError;
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  setBlocked(blocked: boolean): void {
    this.blockedByPermanentError = blocked;
  }

  snapshot(): CloudAutoSyncStatus {
    return { ...this.status };
  }

  update(changes: Partial<CloudAutoSyncStatus>): void {
    this.status = { ...this.status, ...changes };
    this.emit();
  }

  emit(): void {
    try {
      this.onStatus?.(this.snapshot());
    } catch {
      // Observers are outside the synchronization transaction and must never
      // strand run waiters or prevent later polls.
    }
  }

  canRunAutomatically(started: boolean): boolean {
    return started
      && this.status.enabled
      && this.status.configured
      && this.online
      && !this.blockedByPermanentError;
  }

  baseIdleState(): CloudAutoSyncStatus['state'] {
    if (!this.status.enabled) return 'disabled';
    if (!this.status.configured) return 'unconfigured';
    if (!this.online) return 'offline';
    if (this.blockedByPermanentError) return 'error';
    return 'idle';
  }
}
