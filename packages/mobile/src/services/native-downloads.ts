import { NativeModules, Platform } from 'react-native';

export interface NativeActiveDownloadPayload {
  id: number;
  title: string;
  artist: string;
  progress: number;
  status: 'pending' | 'downloading' | 'retrying';
}

export interface NativeSettledDownloadPayload {
  id: number;
  title: string;
  artist: string;
  error?: string | null;
}

type AndroidDownloadsModule = {
  createChannels(): Promise<void>;
  dismissDownloadNotifications(ids: number[]): Promise<void>;
  showCompletedDownload(payload: NativeSettledDownloadPayload): Promise<void>;
  showErrorDownload(payload: NativeSettledDownloadPayload): Promise<void>;
  startBackgroundWork(action: string, itemId: number): Promise<void>;
  stopBackgroundWork(): Promise<void>;
  syncActiveDownloads(items: NativeActiveDownloadPayload[]): Promise<void>;
};

function getAndroidDownloadsModule(): AndroidDownloadsModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }

  return NativeModules.AndroidDownloads as AndroidDownloadsModule | undefined ?? null;
}

export async function createDownloadChannels(): Promise<void> {
  const module = getAndroidDownloadsModule();
  if (!module) {
    return;
  }

  await module.createChannels();
}

export async function syncActiveDownloadNotifications(
  items: NativeActiveDownloadPayload[],
): Promise<void> {
  const module = getAndroidDownloadsModule();
  if (!module) {
    return;
  }

  await module.syncActiveDownloads(items);
}

export async function showCompletedDownloadNotification(
  payload: NativeSettledDownloadPayload,
): Promise<void> {
  const module = getAndroidDownloadsModule();
  if (!module) {
    return;
  }

  await module.showCompletedDownload(payload);
}

export async function showErrorDownloadNotification(
  payload: NativeSettledDownloadPayload,
): Promise<void> {
  const module = getAndroidDownloadsModule();
  if (!module) {
    return;
  }

  await module.showErrorDownload(payload);
}

export async function dismissDownloadNotifications(ids: number[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const module = getAndroidDownloadsModule();
  if (!module) {
    return;
  }

  await module.dismissDownloadNotifications(ids);
}

export async function startDownloadBackgroundWork(
  action: 'resume' | 'cancel' | 'retry',
  itemId: number | null = null,
): Promise<void> {
  const module = getAndroidDownloadsModule();
  if (!module) {
    return;
  }

  await module.startBackgroundWork(action, itemId ?? -1);
}

export async function stopDownloadBackgroundWork(): Promise<void> {
  const module = getAndroidDownloadsModule();
  if (!module) {
    return;
  }

  await module.stopBackgroundWork();
}
