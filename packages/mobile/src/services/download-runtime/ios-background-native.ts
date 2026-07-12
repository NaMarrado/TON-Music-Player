import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  type EmitterSubscription,
} from 'react-native';
import type {
  IosBackgroundDownloadActivityRequest,
  IosBackgroundDownloadEvent,
  IosBackgroundDownloadRequest,
  IosBackgroundDownloadSnapshot,
} from './ios-background-types';

type IosBackgroundDownloadsModule = {
  acknowledgeSettled(itemId: number): Promise<void>;
  beginDownloadActivity(request: IosBackgroundDownloadActivityRequest): Promise<void>;
  cancelDownload(itemId: number): Promise<void>;
  endDownloadActivity(itemId: number): Promise<void>;
  getSnapshot(): Promise<IosBackgroundDownloadSnapshot>;
  initialize(): Promise<void>;
  recoverDownload(request: IosBackgroundDownloadRequest): Promise<IosBackgroundDownloadEvent>;
  startDownload(request: IosBackgroundDownloadRequest): Promise<void>;
};

const IOS_BACKGROUND_DOWNLOAD_EVENT = 'iosBackgroundDownload';

function getIosBackgroundDownloadsModule(): IosBackgroundDownloadsModule | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  return NativeModules.IosBackgroundDownloads as IosBackgroundDownloadsModule | undefined ?? null;
}

export function isIosBackgroundDownloadsAvailable(): boolean {
  return getIosBackgroundDownloadsModule() != null;
}

export async function initializeIosBackgroundDownloadsNative(): Promise<void> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    return;
  }

  await module.initialize();
}

export async function beginIosBackgroundDownloadActivity(
  request: IosBackgroundDownloadActivityRequest,
): Promise<void> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    return;
  }

  await module.beginDownloadActivity(request);
}

export async function endIosBackgroundDownloadActivity(itemId: number): Promise<void> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    return;
  }

  await module.endDownloadActivity(itemId);
}

export async function startIosBackgroundDownload(
  request: IosBackgroundDownloadRequest,
): Promise<void> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    throw new Error('ios_background_downloads_unavailable');
  }

  await module.startDownload(request);
}

export async function recoverIosBackgroundDownload(
  request: IosBackgroundDownloadRequest,
): Promise<IosBackgroundDownloadEvent> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    throw new Error('ios_background_downloads_unavailable');
  }

  return module.recoverDownload(request);
}

export async function cancelIosBackgroundDownload(itemId: number): Promise<void> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    return;
  }

  await module.cancelDownload(itemId);
}

export async function getIosBackgroundDownloadSnapshot(): Promise<IosBackgroundDownloadSnapshot> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    return { items: [] };
  }

  const snapshot = await module.getSnapshot();

  if (Array.isArray(snapshot)) {
    return { items: snapshot as IosBackgroundDownloadSnapshot['items'] };
  }

  if (
    snapshot
    && typeof snapshot === 'object'
    && 'items' in snapshot
    && Array.isArray((snapshot as { items?: unknown }).items)
  ) {
    return snapshot as IosBackgroundDownloadSnapshot;
  }

  return { items: [] };
}

export async function acknowledgeIosBackgroundSettled(itemId: number): Promise<void> {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    return;
  }

  await module.acknowledgeSettled(itemId);
}

export function subscribeToIosBackgroundDownloads(
  listener: (event: IosBackgroundDownloadEvent) => void,
): EmitterSubscription | null {
  const module = getIosBackgroundDownloadsModule();
  if (!module) {
    return null;
  }

  const emitter = new NativeEventEmitter(module as never);
  return emitter.addListener(IOS_BACKGROUND_DOWNLOAD_EVENT, listener);
}
