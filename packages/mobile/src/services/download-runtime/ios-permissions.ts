import * as Notifications from 'expo-notifications';
import {
  getDownloadNotificationPermission,
  setDownloadNotificationPermission,
} from '../../stores/download-runtime-store';
import {
  isGrantedIosNotificationStatus,
  isIosDownloadRuntime,
  mapIosDownloadNotificationPermission,
} from './ios-shared';

let permissionPromise: Promise<boolean> | null = null;

export async function ensureIosDownloadNotificationPermission(
  interactive = true,
): Promise<boolean> {
  if (!isIosDownloadRuntime()) {
    return false;
  }

  if (permissionPromise) {
    return permissionPromise;
  }

  permissionPromise = (async () => {
    const existingStatus = await Notifications.getPermissionsAsync();
    if (isGrantedIosNotificationStatus(existingStatus)) {
      setDownloadNotificationPermission('granted');
      return true;
    }

    if (!interactive) {
      const nextStatus = mapIosDownloadNotificationPermission(existingStatus);
      if (!(nextStatus === 'denied' && getDownloadNotificationPermission() === 'denied')) {
        setDownloadNotificationPermission(nextStatus);
      }
      return false;
    }

    const requestedStatus = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
        allowProvisional: false,
      },
    });
    const granted = isGrantedIosNotificationStatus(requestedStatus);
    setDownloadNotificationPermission(granted ? 'granted' : 'denied');
    return granted;
  })().finally(() => {
    permissionPromise = null;
  });

  return permissionPromise;
}
