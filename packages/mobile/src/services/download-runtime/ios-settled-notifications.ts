import * as Notifications from 'expo-notifications';
import { getDownloadFailureTranslationKey } from '@ton/core';
import i18n from '../../i18n';
import { claimQueueItemSettledNotification } from '../download-queue/db';
import {
  setDownloadNotificationPermission,
} from '../../stores/download-runtime-store';
import {
  isIosDownloadRuntime,
  mapIosDownloadNotificationPermission,
} from './ios-shared';

type DownloadNotificationKind = 'completed' | 'error';

type DownloadNotificationPayload = {
  id: number;
  title: string;
  artist: string;
  error?: string | null;
};

let handlerInitialized = false;

function getNotificationBody(payload: DownloadNotificationPayload): string {
  if (payload.error?.trim()) {
    return i18n.t(`downloads:${getDownloadFailureTranslationKey(payload.error)}`);
  }

  if (payload.artist.trim()) {
    return payload.artist;
  }

  return i18n.t('downloads:notificationFallbackBody');
}

function getNotificationTitle(
  kind: DownloadNotificationKind,
  payload: DownloadNotificationPayload,
): string {
  return kind === 'completed'
    ? i18n.t('downloads:downloadCompletedNotification', { title: payload.title })
    : i18n.t('downloads:downloadFailedNotification', { title: payload.title });
}

async function scheduleDownloadNotification(
  kind: DownloadNotificationKind,
  payload: DownloadNotificationPayload,
): Promise<void> {
  initializeIosDownloadNotifications();

  const status = await Notifications.getPermissionsAsync();
  const mappedStatus = mapIosDownloadNotificationPermission(status);
  setDownloadNotificationPermission(mappedStatus);
  if (mappedStatus !== 'granted') {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: getNotificationTitle(kind, payload),
      body: getNotificationBody(payload),
      data: {
        downloadId: payload.id,
        kind,
        url: 'ton://downloads',
      },
      sound: false,
    },
    trigger: null,
  });
}

export function initializeIosDownloadNotifications(): void {
  if (!isIosDownloadRuntime() || handlerInitialized) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  handlerInitialized = true;
}

export async function syncIosDownloadNotificationSnapshot(
  items: Array<{
    id: number;
    status: string;
    progress: number;
    error: string | null;
    input: { title: string; artist: string };
  }>,
  _previousSnapshot: Map<number, {
    id: number;
    status: string;
    progress: number;
    error: string | null;
    input: { title: string; artist: string };
  }>,
): Promise<void> {
  if (!isIosDownloadRuntime()) {
    return;
  }

  for (const item of items) {
    if (item.status !== 'completed' && item.status !== 'error') {
      continue;
    }

    const claimed = await claimQueueItemSettledNotification(item.id);
    if (!claimed) {
      continue;
    }

    await scheduleDownloadNotification(item.status, {
      id: item.id,
      title: item.input.title,
      artist: item.input.artist,
      error: item.error,
    });
  }
}
