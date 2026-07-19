import * as FileSystem from 'expo-file-system';
import {
  acknowledgeIosBackgroundSettled,
  cancelIosBackgroundDownload,
  getIosBackgroundDownloadSnapshot,
  initializeIosBackgroundDownloadsNative,
  isIosBackgroundDownloadsAvailable,
  startIosBackgroundDownload,
  subscribeToIosBackgroundDownloads,
} from '../download-runtime/ios-background-native';
import { IOS_CLOUD_SYNC_DOWNLOAD_STRATEGY } from '../download-runtime/ios-background-types';

export async function downloadCloudFileInIosBackground(input: {
  destinationUri: string;
  headers: Record<string, string>;
  objectKey: string;
  signal?: AbortSignal;
  url: string;
}): Promise<string | null> {
  if (!isIosBackgroundDownloadsAvailable()) return null;
  const itemId = stableCloudTaskId(input.objectKey);
  await initializeIosBackgroundDownloadsNative();
  const snapshot = await getIosBackgroundDownloadSnapshot();
  const existing = snapshot.items.find((item) => (
    item.itemId === itemId && item.strategy === IOS_CLOUD_SYNC_DOWNLOAD_STRATEGY
  ));
  if (existing && existing.destinationPath !== input.destinationUri) {
    if (existing.state === 'running') throw new Error('cloud_sync_background_task_collision');
    await acknowledgeIosBackgroundSettled(itemId);
  }
  if (existing?.state === 'completed' && existing.destinationPath === input.destinationUri) {
    const info = await FileSystem.getInfoAsync(input.destinationUri);
    await acknowledgeIosBackgroundSettled(itemId);
    if (info.exists) return input.destinationUri;
  }
  if (existing && existing.state !== 'running') {
    await acknowledgeIosBackgroundSettled(itemId);
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      subscription?.remove();
      input.signal?.removeEventListener('abort', abort);
      void acknowledgeIosBackgroundSettled(itemId).catch(() => {});
      if (error) reject(error);
      else resolve(input.destinationUri);
    };
    const abort = () => {
      void cancelIosBackgroundDownload(itemId).finally(() => {
        finish(new Error('cloud_sync_cancelled'));
      });
    };
    const subscription = subscribeToIosBackgroundDownloads((event) => {
      if (event.itemId !== itemId || event.strategy !== IOS_CLOUD_SYNC_DOWNLOAD_STRATEGY) return;
      if (event.state === 'completed') finish();
      else if (event.state === 'failed') finish(new Error(event.error ?? 'cloud_sync_download_failed'));
      else if (event.state === 'cancelled') finish(new Error('cloud_sync_cancelled'));
    });
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) {
      abort();
      return;
    }
    if (existing?.state === 'running' && existing.destinationPath === input.destinationUri) return;
    void startIosBackgroundDownload({
      activeNotificationBody: '',
      activeNotificationTitle: '',
      artist: '',
      destinationPath: input.destinationUri,
      format: 'm4a',
      headers: input.headers,
      itemId,
      safeName: input.objectKey,
      silent: true,
      strategy: IOS_CLOUD_SYNC_DOWNLOAD_STRATEGY,
      title: '',
      url: input.url,
      videoId: input.objectKey,
    }).catch((error) => finish(error instanceof Error ? error : new Error(String(error))));
  });
}

function stableCloudTaskId(objectKey: string): number {
  let hash = 2166136261;
  for (let index = 0; index < objectKey.length; index += 1) {
    hash ^= objectKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return -1 - (hash >>> 1);
}
