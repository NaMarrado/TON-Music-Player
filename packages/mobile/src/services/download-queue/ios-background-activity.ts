import { Platform } from 'react-native';
import i18n from '../../i18n';
import {
  beginIosBackgroundDownloadActivity,
  cancelIosBackgroundDownload,
  endIosBackgroundDownloadActivity,
  isIosBackgroundDownloadsAvailable,
} from '../download-runtime/ios-background-session';
import { isQueueItemActive } from './items';
import { releaseQueueItemActive } from './runtime';
import { iosBackgroundState as state, type IosBackgroundQueueFacade } from './ios-background-state';

export function getActiveNotificationCopy(title: string, artist: string): {
  activeNotificationBody: string;
  activeNotificationTitle: string;
} {
  return {
    activeNotificationBody: artist.trim()
      ? i18n.t('downloads:downloadActiveNotificationBody', { artist })
      : i18n.t('downloads:notificationFallbackBody'),
    activeNotificationTitle: i18n.t('downloads:downloadActiveNotification', { title }),
  };
}

export async function beginQueueItemDownloadActivity(
  itemId: number,
  item: IosBackgroundQueueFacade['runtime']['items'][number],
): Promise<void> {
  try {
    await beginIosBackgroundDownloadActivity({
      ...getActiveNotificationCopy(item.input.title, item.input.artist),
      artist: item.input.artist,
      itemId,
      title: item.input.title,
    });
  } catch (error) {
    console.warn('[DL-IOS] failed to begin download activity', itemId, error);
  }
}

export async function endQueueItemDownloadActivity(itemId: number): Promise<void> {
  try { await endIosBackgroundDownloadActivity(itemId); }
  catch (error) { console.warn('[DL-IOS] failed to end download activity', itemId, error); }
}

export function isIosBackgroundQueueEnabled(): boolean {
  return Platform.OS === 'ios' && isIosBackgroundDownloadsAvailable();
}

export function attachActiveHandle(queue: IosBackgroundQueueFacade, itemId: number): void {
  queue.runtime.activeDownloads.set(itemId, {
    cancel: async () => {
      await cancelIosBackgroundDownload(itemId);
      await endQueueItemDownloadActivity(itemId);
    },
  });
}

export function hasActiveSlot(queue: IosBackgroundQueueFacade, itemId: number): boolean {
  if (queue.runtime.activeItemIds.has(itemId)) return true;
  const item = queue.runtime.items.find((entry) => entry.id === itemId);
  return item ? isQueueItemActive(item) : false;
}

export function releaseActiveSlot(queue: IosBackgroundQueueFacade, itemId: number): void {
  if (!releaseQueueItemActive(queue.runtime, itemId) && queue.runtime.activeCount > 0) {
    queue.runtime.activeCount -= 1;
  }
  queue.runtime.activeDownloads.delete(itemId);
}

export function rememberFailedStrategy(
  itemId: number,
  strategy: string | null | undefined,
): void {
  if (!strategy) return;
  const failed = state.failedStrategiesByItemId.get(itemId) ?? new Set<string>();
  failed.add(strategy);
  state.failedStrategiesByItemId.set(itemId, failed);
}

export function clearFailedStrategies(itemId: number): void {
  state.failedStrategiesByItemId.delete(itemId);
  state.candidateRetryErrorsByItemId.delete(itemId);
}

export function getFailedStrategies(itemId: number): string[] {
  return Array.from(state.failedStrategiesByItemId.get(itemId) ?? []);
}
