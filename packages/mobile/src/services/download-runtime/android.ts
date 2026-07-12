import {
  ensureDownloadNotificationPermission,
  initializeAndroidDownloadRuntime,
  maybeStartBackgroundWork,
  runDownloadHeadlessTask,
  stopBackgroundWorkIfIdle,
  syncAndroidDownloadQueueSnapshot,
} from '../android-download-runtime';
import type { QueueItem } from '../download-queue';
import type { DownloadNotificationPermission } from '../../stores/download-runtime-store';
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
  initializeAndroidDownloadRuntime();
}

export async function ensureDownloadRuntimePermission(
  interactive = true,
): Promise<boolean> {
  return ensureDownloadNotificationPermission(interactive);
}

export async function maybeStartDownloadBackgroundWork(
  action: DownloadRuntimeAction,
  itemId: number | null = null,
): Promise<void> {
  await maybeStartBackgroundWork(action, itemId);
}

export async function stopDownloadBackgroundWorkIfIdle(): Promise<void> {
  await stopBackgroundWorkIfIdle();
}

export async function syncDownloadQueueRuntimeSnapshot(
  items: QueueItem[],
  previousItems: Map<number, QueueItem>,
): Promise<void> {
  await syncAndroidDownloadQueueSnapshot(items, previousItems);
}

export async function runDownloadRuntimeHeadlessTask(
  payload: DownloadHeadlessTaskPayload = {},
): Promise<void> {
  await runDownloadHeadlessTask(payload);
}
