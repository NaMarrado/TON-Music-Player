import type { QueueItem } from '../download-queue';
import { claimQueueItemSettledNotification } from '../download-queue/db';
import {
  dismissDownloadNotifications,
  showCompletedDownloadNotification,
  showErrorDownloadNotification,
  stopDownloadBackgroundWork,
  syncActiveDownloadNotifications,
} from '../native-downloads';
import {
  ACTIVE_STATUSES,
  ensureChannelsReady,
  hasGrantedPermission,
  isAndroid,
  toNativeActiveDownload,
} from './shared';

export async function syncAndroidDownloadQueueSnapshot(
  items: QueueItem[],
  previousSnapshot: Map<number, QueueItem>,
): Promise<void> {
  if (!isAndroid()) {
    return;
  }

  await ensureChannelsReady();

  const activeItems = items.filter((item) => ACTIVE_STATUSES.has(item.status));

  for (const item of items) {
    const previous = previousSnapshot.get(item.id);
    const isSettled = item.status === 'completed' || item.status === 'error';
    const claimedSettledNotification = isSettled
      ? await claimQueueItemSettledNotification(item.id)
      : false;

    if (item.status === 'completed' && claimedSettledNotification && hasGrantedPermission()) {
      await showCompletedDownloadNotification({
        id: item.id,
        title: item.input.title,
        artist: item.input.artist,
      });
    }

    if (item.status === 'error' && claimedSettledNotification && hasGrantedPermission()) {
      await showErrorDownloadNotification({
        id: item.id,
        title: item.input.title,
        artist: item.input.artist,
        error: item.error,
      });
    }

    if (
      previous
      && previous.status === 'error'
      && item.status !== 'error'
      && hasGrantedPermission()
    ) {
      await dismissDownloadNotifications([item.id]);
    }
  }

  await syncActiveDownloadNotifications(activeItems.map(toNativeActiveDownload));

  if (activeItems.length === 0) {
    await stopDownloadBackgroundWork();
    return;
  }
}
