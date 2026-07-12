import type { QueueItem } from '../download-queue';
import type { DownloadNotificationPermission } from '../../stores/download-runtime-store';

export type DownloadRuntimeAction = 'resume' | 'cancel' | 'retry';

export type DownloadHeadlessTaskPayload = {
  action?: DownloadRuntimeAction;
  itemId?: number;
};

export type DownloadRuntimePermissionNoticeKey =
  | 'backgroundPermissionNotice'
  | 'notificationPermissionNotice';

export interface DownloadRuntimeModule {
  ensureDownloadRuntimePermission(interactive?: boolean): Promise<boolean>;
  getDownloadRuntimePermissionNoticeKey(
    permission: DownloadNotificationPermission,
  ): DownloadRuntimePermissionNoticeKey | null;
  initializeDownloadRuntime(): void;
  maybeStartDownloadBackgroundWork(
    action: DownloadRuntimeAction,
    itemId?: number | null,
  ): Promise<void>;
  runDownloadRuntimeHeadlessTask(payload?: DownloadHeadlessTaskPayload): Promise<void>;
  stopDownloadBackgroundWorkIfIdle(): Promise<void>;
  syncDownloadQueueRuntimeSnapshot(
    items: QueueItem[],
    previousItems: Map<number, QueueItem>,
  ): Promise<void>;
}
