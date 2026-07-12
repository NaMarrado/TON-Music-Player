import { startDownloadBackgroundWork, stopDownloadBackgroundWork } from '../native-downloads';
import {
  ensureChannelsReady,
  getAppState,
  getQueue,
  hasGrantedPermission,
  isAndroid,
} from './shared';

export async function maybeStartBackgroundWork(
  action: 'resume' | 'cancel' | 'retry',
  itemId: number | null = null,
): Promise<boolean> {
  if (!isAndroid() || !hasGrantedPermission() || getAppState() === 'active') {
    return false;
  }

  await ensureChannelsReady();
  await startDownloadBackgroundWork(action, itemId);
  return true;
}

export async function stopBackgroundWorkIfIdle(): Promise<void> {
  if (!isAndroid() || !hasGrantedPermission()) {
    return;
  }

  const queue = getQueue();
  if (queue.hasActive()) {
    return;
  }

  await stopDownloadBackgroundWork();
}
