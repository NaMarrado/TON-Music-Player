import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import i18n from '../../i18n';
import {
  finalizeDownloadedTrack,
  prepareDownloadSource,
  type DownloadFinalizeInput,
} from '../downloader';
import { cleanupFailedDownload } from '../downloader/filesystem';
import { invalidatePoToken } from '../po-token-service';
import { resetPlayerClient } from '../youtube-search/client';
import {
  acknowledgeIosBackgroundSettled,
  beginIosBackgroundDownloadActivity,
  cancelIosBackgroundDownload,
  endIosBackgroundDownloadActivity,
  getIosBackgroundDownloadSnapshot,
  initializeIosBackgroundDownloadsNative,
  isIosBackgroundDownloadsAvailable,
  recoverIosBackgroundDownload,
  subscribeToIosBackgroundDownloads,
  type IosBackgroundDownloadEvent,
  type IosBackgroundDownloadSnapshotItem,
} from '../download-runtime/ios-background-session';
import { updateQueueItemFormat, updateQueueItemProgress, updateQueueItemStatus } from './db';
import { isQueueItemActive } from './items';
import { clearProgressTracking, trackQueueProgress } from './progress';
import {
  markQueueItemActive,
  releaseQueueItemActive,
  type QueueRuntimeState,
} from './runtime';
import { updateQueueItem } from './mutations';
import {
  completeQueueItem,
  failQueueItem,
  type QueueSettlementFacade,
} from './settlement';

export interface IosBackgroundQueueFacade extends QueueSettlementFacade {
  runtime: QueueRuntimeState;
}

let eventsSubscription: EmitterSubscription | null = null;
let restorePromise: Promise<void> | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let reconcileInFlight = false;
const settlingItemIds = new Set<number>();
const failedStrategiesByItemId = new Map<number, Set<string>>();
const foregroundPromiseItemIds = new Set<number>();
const candidateRetryPromisesByItemId = new Map<number, Promise<boolean>>();
const candidateRetryErrorsByItemId = new Map<number, string>();

const NATIVE_CANDIDATE_REJECTION_RE = /\bHTTP 4\d\d\b|unexpected content type/i;

function getActiveNotificationCopy(title: string, artist: string): {
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

async function beginQueueItemDownloadActivity(
  itemId: number,
  item: NonNullable<IosBackgroundQueueFacade['runtime']['items'][number]>,
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

async function endQueueItemDownloadActivity(itemId: number): Promise<void> {
  try {
    await endIosBackgroundDownloadActivity(itemId);
  } catch (error) {
    console.warn('[DL-IOS] failed to end download activity', itemId, error);
  }
}

function isIosBackgroundQueueEnabled(): boolean {
  return Platform.OS === 'ios' && isIosBackgroundDownloadsAvailable();
}

function attachActiveHandle(
  queue: IosBackgroundQueueFacade,
  itemId: number,
): void {
  queue.runtime.activeDownloads.set(itemId, {
    cancel: async () => {
      await cancelIosBackgroundDownload(itemId);
      await endQueueItemDownloadActivity(itemId);
    },
  });
}

function hasActiveSlot(queue: IosBackgroundQueueFacade, itemId: number): boolean {
  if (queue.runtime.activeItemIds.has(itemId)) {
    return true;
  }

  const item = queue.runtime.items.find((entry) => entry.id === itemId);
  return item ? isQueueItemActive(item) : false;
}

function releaseActiveSlot(queue: IosBackgroundQueueFacade, itemId: number): void {
  if (
    !releaseQueueItemActive(queue.runtime, itemId)
    && queue.runtime.activeCount > 0
  ) {
    queue.runtime.activeCount -= 1;
  }
  queue.runtime.activeDownloads.delete(itemId);
}

function rememberFailedStrategy(itemId: number, strategy: string | null | undefined): void {
  if (!strategy) {
    return;
  }

  const failedStrategies = failedStrategiesByItemId.get(itemId) ?? new Set<string>();
  failedStrategies.add(strategy);
  failedStrategiesByItemId.set(itemId, failedStrategies);
}

function clearFailedStrategies(itemId: number): void {
  failedStrategiesByItemId.delete(itemId);
  candidateRetryErrorsByItemId.delete(itemId);
}

function getFailedStrategies(itemId: number): string[] {
  return Array.from(failedStrategiesByItemId.get(itemId) ?? []);
}

function createFailedCandidateSnapshotItem(
  itemId: number,
  queueItem: NonNullable<IosBackgroundQueueFacade['runtime']['items'][number]>,
  error: string,
  prepared: Awaited<ReturnType<typeof prepareDownloadSource>> | null,
): IosBackgroundDownloadSnapshotItem {
  return {
    artist: queueItem.input.artist,
    bytesWritten: 0,
    coverUrl: prepared?.coverUrl ?? queueItem.input.coverUrl,
    destinationPath: prepared?.filePath ?? '',
    error,
    format: prepared?.format ?? 'm4a',
    headers: prepared?.headers,
    itemId,
    progress: 0,
    safeName: prepared?.safeName ?? queueItem.input.title,
    state: 'failed',
    strategy: prepared?.strategy ?? null,
    title: queueItem.input.title,
    totalBytes: prepared?.contentLength ?? null,
    url: prepared?.url ?? queueItem.input.sourceUrl,
    videoId: prepared?.videoId ?? queueItem.input.sourceId,
  };
}

function shouldTryNextNativeCandidate(error: string | null | undefined): boolean {
  return Boolean(error && NATIVE_CANDIDATE_REJECTION_RE.test(error));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return String(error);
}

function combineCandidateErrors(
  originalError: string | null | undefined,
  nextError: unknown,
): string {
  const prefix = originalError && originalError.trim().length > 0
    ? originalError
    : 'download_failed';
  return `${prefix}; next candidate failed: ${getErrorMessage(nextError)}`;
}

async function recoverPreparedIosQueueItem(
  queue: IosBackgroundQueueFacade,
  itemId: number,
  queueItem: NonNullable<IosBackgroundQueueFacade['runtime']['items'][number]>,
  prepared: Awaited<ReturnType<typeof prepareDownloadSource>>,
): Promise<void> {
  updateQueueItem(queue.runtime, itemId, (current) => ({
    ...current,
    format: prepared.format,
  }));
  await updateQueueItemFormat(itemId, prepared.format);

  foregroundPromiseItemIds.add(itemId);
  try {
    const completedItem = await recoverIosBackgroundDownload({
      ...getActiveNotificationCopy(queueItem.input.title, queueItem.input.artist),
      artist: queueItem.input.artist,
      contentLength: prepared.contentLength,
      coverUrl: prepared.coverUrl,
      destinationPath: prepared.filePath,
      format: prepared.format,
      headers: prepared.headers,
      itemId,
      safeName: prepared.safeName,
      strategy: prepared.strategy,
      title: queueItem.input.title,
      url: prepared.url,
      videoId: prepared.videoId,
    });

    if (queue.runtime.cancellingIds.has(itemId)) {
      await cleanupFailedDownload(completedItem.destinationPath);
      throw new Error('download_cancelled');
    }

    await finalizeCompletedBackgroundItem(queue, completedItem);
    clearFailedStrategies(itemId);
  } finally {
    foregroundPromiseItemIds.delete(itemId);
  }
}

async function removeOrphanCompletedFile(filePath: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  } catch {
    // Best-effort cleanup if the queue entry no longer exists.
  }
}

async function getBackgroundArtifactSize(filePath: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(filePath, { size: true });
  return info.exists && typeof info.size === 'number' ? info.size : 0;
}

async function recoverInvalidCompletedBackgroundItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<number> {
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (!queueItem) {
    throw new Error('queue_item_missing');
  }

  console.warn(
    '[DL-IOS] Recovering invalid completed background item via fresh native foreground session:',
    queueItem.input.title,
  );

  await beginQueueItemDownloadActivity(item.itemId, queueItem);
  const prepared = await prepareDownloadSource(queueItem.input);
  attachActiveHandle(queue, item.itemId);
  const recoveredItem = await recoverIosBackgroundDownload({
    ...getActiveNotificationCopy(queueItem.input.title, queueItem.input.artist),
    artist: queueItem.input.artist,
    contentLength: prepared.contentLength,
    coverUrl: prepared.coverUrl,
    destinationPath: prepared.filePath,
    format: prepared.format,
    headers: prepared.headers,
    itemId: item.itemId,
    safeName: prepared.safeName,
    strategy: prepared.strategy,
    title: queueItem.input.title,
    url: prepared.url,
    videoId: prepared.videoId,
  });

  if (queue.runtime.cancellingIds.has(item.itemId)) {
    await cleanupFailedDownload(recoveredItem.destinationPath);
    throw new Error('download_cancelled');
  }

  const result = await finalizeDownloadedTrack(
    {
      contentLength: recoveredItem.totalBytes ?? recoveredItem.bytesWritten ?? 0,
      coverUrl: recoveredItem.coverUrl,
      filePath: recoveredItem.destinationPath,
      format: recoveredItem.format,
      safeName: recoveredItem.safeName,
      videoId: recoveredItem.videoId,
    } satisfies DownloadFinalizeInput,
    queueItem.input,
    {
      isCancelled: () => queue.runtime.cancellingIds.has(item.itemId),
      onCancelable: (cancel) => {
        queue.runtime.activeDownloads.set(item.itemId, { cancel });
      },
    },
  );

  return result.trackId;
}

async function finalizeCompletedBackgroundItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);

  if (!queueItem) {
    await removeOrphanCompletedFile(item.destinationPath);
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }

  if (queueItem.status === 'completed' && queueItem.trackId != null) {
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }

  const artifactSize = await getBackgroundArtifactSize(item.destinationPath);
  if (artifactSize < 1000) {
    await removeOrphanCompletedFile(item.destinationPath);
    const recoveredTrackId = await recoverInvalidCompletedBackgroundItem(queue, item);
    await completeQueueItem(queue, item.itemId, recoveredTrackId);
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }

  const result = await finalizeDownloadedTrack(
    {
      contentLength: item.totalBytes ?? 0,
      coverUrl: item.coverUrl,
      filePath: item.destinationPath,
      format: item.format,
      safeName: item.safeName,
      videoId: item.videoId,
    } satisfies DownloadFinalizeInput,
    queueItem.input,
    {
      isCancelled: () => queue.runtime.cancellingIds.has(item.itemId),
      onCancelable: (cancel) => {
        queue.runtime.activeDownloads.set(item.itemId, { cancel });
      },
    },
  );

  await completeQueueItem(queue, item.itemId, result.trackId);
  await acknowledgeIosBackgroundSettled(item.itemId);
}

async function failBackgroundItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  await endQueueItemDownloadActivity(item.itemId);
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (
    queueItem?.status === 'error'
    || queueItem?.status === 'retrying'
    || queueItem?.status === 'completed'
  ) {
    await acknowledgeIosBackgroundSettled(item.itemId);
    return;
  }

  await cleanupFailedDownload(item.destinationPath);
  await failQueueItem(queue, item.itemId, item.error ?? 'download_failed');
  await acknowledgeIosBackgroundSettled(item.itemId);
}

async function tryStartNextIosBackgroundCandidate(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<boolean> {
  if (!shouldTryNextNativeCandidate(item.error)) {
    return false;
  }

  const existingRetry = candidateRetryPromisesByItemId.get(item.itemId);
  if (existingRetry) {
    const restarted = await existingRetry;
    if (!restarted) {
      item.error = candidateRetryErrorsByItemId.get(item.itemId) ?? item.error;
    }
    return restarted;
  }

  const retryPromise = tryStartNextIosBackgroundCandidateOnce(queue, item)
    .finally(() => {
      candidateRetryPromisesByItemId.delete(item.itemId);
    });
  candidateRetryPromisesByItemId.set(item.itemId, retryPromise);
  return retryPromise;
}

async function tryStartNextIosBackgroundCandidateOnce(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<boolean> {
  await cleanupFailedDownload(item.destinationPath);
  invalidatePoToken({ binding: 'video', videoId: item.videoId });
  resetPlayerClient();

  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (!queueItem) {
    return false;
  }

  rememberFailedStrategy(item.itemId, item.strategy);
  await beginQueueItemDownloadActivity(item.itemId, queueItem);

  let prepared: Awaited<ReturnType<typeof prepareDownloadSource>>;
  try {
    prepared = await prepareDownloadSource(queueItem.input, {
      skipStrategies: getFailedStrategies(item.itemId),
    });
  } catch (error) {
    item.error = combineCandidateErrors(item.error, error);
    candidateRetryErrorsByItemId.set(item.itemId, item.error);
    return false;
  }

  updateQueueItem(queue.runtime, item.itemId, (current) => ({
    ...current,
    status: 'downloading',
    progress: 0,
    error: null,
  }));
  queue.runtime.persistedProgress.set(item.itemId, 0);
  await updateQueueItemStatus(item.itemId, 'downloading');
  await updateQueueItemProgress(item.itemId, 0);

  const alreadyActive = queue.runtime.activeItemIds.has(item.itemId);
  if (!alreadyActive) {
    markQueueItemActive(queue.runtime, item.itemId);
  }
  attachActiveHandle(queue, item.itemId);

  try {
    await recoverPreparedIosQueueItem(queue, item.itemId, queueItem, prepared);
    releaseActiveSlot(queue, item.itemId);
    queue.notify();
    queue.processNext();
  } catch (error) {
    rememberFailedStrategy(item.itemId, prepared.strategy);
    item.error = combineCandidateErrors(item.error, error);
    candidateRetryErrorsByItemId.set(item.itemId, item.error);
    if (!alreadyActive) {
      releaseActiveSlot(queue, item.itemId);
    }
    return false;
  }

  candidateRetryErrorsByItemId.delete(item.itemId);
  ensureIosBackgroundQueueReconcile(queue);
  queue.notify();
  return true;
}

function getRestoreErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'ios_background_restore_failed';
}

async function settleRestoredSnapshotItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  if (item.state === 'completed') {
    try {
      await finalizeCompletedBackgroundItem(queue, item);
    } catch (error) {
      console.warn('[DL-IOS] failed to finalize restored completed item', item.itemId, error);
      await failBackgroundItem(queue, {
        ...item,
        state: 'failed',
        error: getRestoreErrorMessage(error),
      });
    }
    return;
  }

  if (item.state === 'failed') {
    const restarted = await tryStartNextIosBackgroundCandidate(queue, item);
    if (!restarted) {
      clearFailedStrategies(item.itemId);
      await failBackgroundItem(queue, item);
    }
    return;
  }

  if (item.state === 'cancelled') {
    await endQueueItemDownloadActivity(item.itemId);
    await cleanupFailedDownload(item.destinationPath);
    await acknowledgeIosBackgroundSettled(item.itemId);
  }
}

async function handleBackgroundEvent(
  queue: IosBackgroundQueueFacade,
  event: IosBackgroundDownloadEvent,
): Promise<void> {
  if (event.state === 'running') {
    const alreadyActive = queue.runtime.activeItemIds.has(event.itemId);
    const updated = updateQueueItem(queue.runtime, event.itemId, (current) => (
      current.progress === event.progress && current.status === 'downloading'
        ? current
        : {
            ...current,
            status: 'downloading',
            progress: event.progress,
            error: null,
          }
    ));
    if (!updated) {
      return;
    }

    if (!alreadyActive) {
      markQueueItemActive(queue.runtime, event.itemId);
    }
    attachActiveHandle(queue, event.itemId);
    trackQueueProgress(queue.runtime, event.itemId, event.progress, queue.notify);
    return;
  }

  if (foregroundPromiseItemIds.has(event.itemId)) {
    return;
  }

  if (event.state === 'completed') {
    const wasActive = hasActiveSlot(queue, event.itemId);
    try {
      await finalizeCompletedBackgroundItem(queue, event);
      clearFailedStrategies(event.itemId);
    } catch (error) {
      await failBackgroundItem(queue, {
        ...event,
        state: 'failed',
        error: getRestoreErrorMessage(error),
      });
    } finally {
      if (wasActive) {
        releaseActiveSlot(queue, event.itemId);
      } else {
        queue.runtime.activeDownloads.delete(event.itemId);
      }
      queue.notify();
      queue.processNext();
    }
    return;
  }

  if (event.state === 'failed') {
    const wasActive = hasActiveSlot(queue, event.itemId);
    let restarted = false;
    try {
      restarted = await tryStartNextIosBackgroundCandidate(queue, event);
      if (!restarted) {
        clearFailedStrategies(event.itemId);
        await failBackgroundItem(queue, event);
      }
    } finally {
      if (!restarted) {
        if (wasActive) {
          releaseActiveSlot(queue, event.itemId);
        } else {
          queue.runtime.activeDownloads.delete(event.itemId);
        }
      }
      queue.notify();
      if (!restarted) {
        queue.processNext();
      }
    }
    return;
  }

  const wasActive = hasActiveSlot(queue, event.itemId);
  clearFailedStrategies(event.itemId);
  clearProgressTracking(queue.runtime, event.itemId);
  queue.runtime.cancellingIds.delete(event.itemId);
  await cleanupFailedDownload(event.destinationPath);
  if (wasActive) {
    releaseActiveSlot(queue, event.itemId);
  } else {
    queue.runtime.activeDownloads.delete(event.itemId);
  }
  await acknowledgeIosBackgroundSettled(event.itemId);
  queue.notify();
  queue.processNext();
}

function ensureIosBackgroundQueueEventSubscription(queue: IosBackgroundQueueFacade): void {
  if (!isIosBackgroundQueueEnabled() || eventsSubscription) {
    return;
  }

  eventsSubscription = subscribeToIosBackgroundDownloads((event) => {
    void handleBackgroundEvent(queue, event).catch((error) => {
      console.warn('[DL-IOS] background event failed', error);
    });
  });
}

function ensureIosBackgroundQueueEvents(queue: IosBackgroundQueueFacade): void {
  ensureIosBackgroundQueueEventSubscription(queue);
  ensureIosBackgroundQueueReconcile(queue);
}

function hasPendingIosBackgroundWork(queue: IosBackgroundQueueFacade): boolean {
  if (queue.runtime.activeDownloads.size > 0) {
    return true;
  }

  return queue.runtime.items.some((item) => (
    item.status === 'pending'
    || item.status === 'downloading'
    || item.status === 'retrying'
  ));
}

function stopIosBackgroundQueueReconcile(): void {
  if (!reconcileTimer) {
    return;
  }

  clearInterval(reconcileTimer);
  reconcileTimer = null;
}

async function settleSnapshotItemOnce(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  if (settlingItemIds.has(item.itemId)) {
    return;
  }

  settlingItemIds.add(item.itemId);
  try {
    await settleRestoredSnapshotItem(queue, item);
  } finally {
    settlingItemIds.delete(item.itemId);
  }
}

async function reconcileIosBackgroundQueueSnapshot(
  queue: IosBackgroundQueueFacade,
): Promise<void> {
  if (reconcileInFlight) {
    return;
  }

  reconcileInFlight = true;

  try {
    const snapshot = await getIosBackgroundDownloadSnapshot();
    const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : [];

    for (const item of snapshotItems) {
      if (item.state === 'running') {
        await restoreRunningItem(queue, item);
        continue;
      }

      await settleSnapshotItemOnce(queue, item);
    }

    queue.notify();
    if (!hasPendingIosBackgroundWork(queue) && snapshotItems.length === 0) {
      stopIosBackgroundQueueReconcile();
    }
  } catch (error) {
    console.warn('[DL-IOS] background reconcile failed', error);
  } finally {
    reconcileInFlight = false;
  }
}

function ensureIosBackgroundQueueReconcile(queue: IosBackgroundQueueFacade): void {
  if (!isIosBackgroundQueueEnabled()) {
    return;
  }

  if (!reconcileTimer) {
    reconcileTimer = setInterval(() => {
      void reconcileIosBackgroundQueueSnapshot(queue);
    }, 2000);
  }

  void reconcileIosBackgroundQueueSnapshot(queue);
}

async function restoreRunningItem(
  queue: IosBackgroundQueueFacade,
  item: IosBackgroundDownloadSnapshotItem,
): Promise<void> {
  const queueItem = queue.runtime.items.find((entry) => entry.id === item.itemId);
  if (!queueItem) {
    return;
  }

  const alreadyActive = queue.runtime.activeItemIds.has(item.itemId);
  if (!alreadyActive) {
    markQueueItemActive(queue.runtime, item.itemId);
  }

  attachActiveHandle(queue, item.itemId);
  updateQueueItem(queue.runtime, item.itemId, (current) => ({
    ...current,
    status: 'downloading',
    progress: item.progress,
    error: null,
  }));
  queue.runtime.persistedProgress.set(item.itemId, item.progress);
  await updateQueueItemStatus(item.itemId, 'downloading');
  await updateQueueItemProgress(item.itemId, item.progress);
}

export async function restoreIosBackgroundQueueItems(
  queue: IosBackgroundQueueFacade,
): Promise<void> {
  if (!isIosBackgroundQueueEnabled()) {
    return;
  }

  ensureIosBackgroundQueueEvents(queue);

  if (restorePromise) {
    return restorePromise;
  }

  restorePromise = (async () => {
    await initializeIosBackgroundDownloadsNative();
    const snapshot = await getIosBackgroundDownloadSnapshot();
    const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : [];

    for (const item of snapshotItems) {
      if (item.state === 'running') {
        await restoreRunningItem(queue, item);
      }
    }

    queue.notify();

    for (const item of snapshotItems) {
      if (item.state === 'running') {
        continue;
      }

      await settleRestoredSnapshotItem(queue, item);
    }

    queue.notify();
  })().finally(() => {
    restorePromise = null;
  });

  await restorePromise;
}

export function startIosBackgroundQueueItem(
  queue: IosBackgroundQueueFacade,
  itemId: number,
): boolean {
  if (!isIosBackgroundQueueEnabled()) {
    return false;
  }

  ensureIosBackgroundQueueEventSubscription(queue);
  attachActiveHandle(queue, itemId);

  void (async () => {
    const item = queue.runtime.items.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    let prepared: Awaited<ReturnType<typeof prepareDownloadSource>> | null = null;

    try {
      await initializeIosBackgroundDownloadsNative();
      if (queue.runtime.cancellingIds.has(itemId)) {
        return;
      }

      await beginQueueItemDownloadActivity(itemId, item);
      if (queue.runtime.cancellingIds.has(itemId)) {
        await endQueueItemDownloadActivity(itemId);
        return;
      }

      clearFailedStrategies(itemId);
      prepared = await prepareDownloadSource(item.input);

      if (queue.runtime.cancellingIds.has(itemId)) {
        await cleanupFailedDownload(prepared.filePath);
        await endQueueItemDownloadActivity(itemId);
        return;
      }

      attachActiveHandle(queue, itemId);
      await recoverPreparedIosQueueItem(queue, itemId, item, prepared);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!queue.runtime.cancellingIds.has(itemId) && message !== 'download_cancelled') {
        const failedCandidate = createFailedCandidateSnapshotItem(
          itemId,
          item,
          message,
          prepared,
        );
        const restarted = await tryStartNextIosBackgroundCandidate(queue, failedCandidate);
        if (restarted) {
          return;
        }

        await endQueueItemDownloadActivity(itemId);
        await failQueueItem(queue, itemId, failedCandidate.error ?? message);
      } else {
        if (prepared) {
          await cleanupFailedDownload(prepared.filePath);
        }
        await endQueueItemDownloadActivity(itemId);
        clearProgressTracking(queue.runtime, itemId);
      }
      await acknowledgeIosBackgroundSettled(itemId);
    } finally {
      queue.runtime.cancellingIds.delete(itemId);
      releaseActiveSlot(queue, itemId);
      queue.notify();
      queue.processNext();
    }
  })();

  return true;
}
