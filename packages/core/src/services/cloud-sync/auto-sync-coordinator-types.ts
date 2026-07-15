import type { CloudAutoSyncStatus, CloudSyncOrigin } from '../../types/cloud-sync';

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

export const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 300_000] as const;

export const DEFAULT_AUTO_SYNC_TIMER: CloudAutoSyncTimerAdapter = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as number),
};

export function defaultCloudAutoSyncErrorKey(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeCloudAutoSyncCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export function normalizeCloudAutoSyncTimestamp(
  value: number | null | undefined,
): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
}
