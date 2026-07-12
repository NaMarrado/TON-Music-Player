import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DownloadNotificationPermission } from '../../stores/download-runtime-store';

export function isIosDownloadRuntime(): boolean {
  return Platform.OS === 'ios';
}

export function isGrantedIosNotificationStatus(
  status: Notifications.NotificationPermissionsStatus,
): boolean {
  return status.granted
    || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export function mapIosDownloadNotificationPermission(
  status: Notifications.NotificationPermissionsStatus,
): DownloadNotificationPermission {
  return isGrantedIosNotificationStatus(status)
    ? 'granted'
    : status.canAskAgain
      ? 'unknown'
      : 'denied';
}
