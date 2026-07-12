import type { QueueItem } from '../download-queue';
import type { DownloadNotificationPermission } from '../../stores/download-runtime-store';
import {
  initializeIosBackgroundDownloadsNative,
  isIosBackgroundDownloadsAvailable,
} from './ios-background-session';
import {
  ensureIosDownloadNotificationPermission,
  syncIosDownloadNotificationSnapshot,
} from './ios-notifications';
import type {
  DownloadHeadlessTaskPayload,
  DownloadRuntimeAction,
  DownloadRuntimePermissionNoticeKey,
} from './types';

export function getDownloadRuntimePermissionNoticeKey(
  permission: DownloadNotificationPermission,
): DownloadRuntimePermissionNoticeKey | null {
  return permission === 'denied' ? 'notificationPermissionNotice' : null;
}

export function initializeDownloadRuntime(): void {
  if (isIosBackgroundDownloadsAvailable()) {
    void initializeIosBackgroundDownloadsNative().catch(() => {});
  }
}

export async function ensureDownloadRuntimePermission(
  interactive = true,
): Promise<boolean> {
  return ensureIosDownloadNotificationPermission(interactive);
}

export async function maybeStartDownloadBackgroundWork(
  _action: DownloadRuntimeAction,
  _itemId: number | null = null,
): Promise<void> {
  // iOS background URLSession work is owned by the native download task itself.
}

export async function stopDownloadBackgroundWorkIfIdle(): Promise<void> {
  // Android foreground services need explicit stop; iOS URLSession does not.
}

export async function syncDownloadQueueRuntimeSnapshot(
  items: QueueItem[],
  previousItems: Map<number, QueueItem>,
): Promise<void> {
  await syncIosDownloadNotificationSnapshot(items, previousItems);
}

export async function runDownloadRuntimeHeadlessTask(
  _payload: DownloadHeadlessTaskPayload = {},
): Promise<void> {
  // Android-only headless retry/cancel entrypoint. iOS resumes via URLSession events.
}
