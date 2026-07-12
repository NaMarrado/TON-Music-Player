import { create } from 'zustand';

export type DownloadNotificationPermission = 'unknown' | 'granted' | 'denied';

interface DownloadRuntimeState {
  notificationPermission: DownloadNotificationPermission;
}

export const useDownloadRuntimeStore = create<DownloadRuntimeState>()(() => ({
  notificationPermission: 'unknown',
}));

export function setDownloadNotificationPermission(
  notificationPermission: DownloadNotificationPermission,
): void {
  useDownloadRuntimeStore.setState({ notificationPermission });
}

export function getDownloadNotificationPermission(): DownloadNotificationPermission {
  return useDownloadRuntimeStore.getState().notificationPermission;
}
