import { startDownloadBackgroundWork, stopDownloadBackgroundWork } from '../native-downloads';
import {
  ensureChannelsReady,
  getAppState,
  getQueue,
  isAndroid,
} from './shared';

export async function maybeStartBackgroundWork(
  action: 'resume' | 'cancel' | 'retry',
  itemId: number | null = null,
): Promise<boolean> {
  if (!isAndroid() || getAppState() === 'active') {
    return false;
  }

  await ensureChannelsReady();
  await startDownloadBackgroundWork(action, itemId);
  return true;
}

export async function stopBackgroundWorkIfIdle(): Promise<void> {
  if (!isAndroid()) {
    return;
  }

  const queue = getQueue();
  if (queue.hasActive()) {
    return;
  }

  await stopDownloadBackgroundWork();
}
