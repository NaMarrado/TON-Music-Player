import { PermissionsAndroid, Platform } from 'react-native';
import {
  getDownloadNotificationPermission,
  setDownloadNotificationPermission,
} from '../../stores/download-runtime-store';
import { isAndroid } from './shared';

let permissionPromise: Promise<boolean> | null = null;

export async function ensureDownloadNotificationPermission(
  interactive = true,
): Promise<boolean> {
  if (!isAndroid()) {
    setDownloadNotificationPermission('granted');
    return true;
  }

  if (Number(Platform.Version) < 33) {
    setDownloadNotificationPermission('granted');
    return true;
  }

  if (permissionPromise) {
    return permissionPromise;
  }

  permissionPromise = (async () => {
    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (alreadyGranted) {
      setDownloadNotificationPermission('granted');
      return true;
    }

    if (!interactive) {
      if (getDownloadNotificationPermission() !== 'denied') {
        setDownloadNotificationPermission('unknown');
      }
      return false;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    const granted = result === PermissionsAndroid.RESULTS.GRANTED;
    setDownloadNotificationPermission(granted ? 'granted' : 'denied');
    return granted;
  })().finally(() => {
    permissionPromise = null;
  });

  return permissionPromise;
}
