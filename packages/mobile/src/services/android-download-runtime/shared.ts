import { AppState, Platform } from 'react-native';
import type { QueueItem } from '../download-queue';
import {
  createDownloadChannels,
  type NativeActiveDownloadPayload,
} from '../native-downloads';
import { getDownloadNotificationPermission } from '../../stores/download-runtime-store';

export type HeadlessTaskPayload = {
  action?: 'resume' | 'cancel' | 'retry';
  itemId?: number;
};

export const ACTIVE_STATUSES = new Set<QueueItem['status']>([
  'pending',
  'downloading',
  'retrying',
]);

let appState = AppState.currentState;
let runtimeInitialized = false;
let channelsPromise: Promise<void> | null = null;

export function isAndroid(): boolean {
  return Platform.OS === 'android';
}

export function getQueue() {
  const { getDownloadQueue } = require('../download-queue') as typeof import('../download-queue');
  return getDownloadQueue();
}

export function getAppState() {
  return appState;
}

export function setAppState(nextState: typeof appState): void {
  appState = nextState;
}

export function hasRuntimeInitialized(): boolean {
  return runtimeInitialized;
}

export function markRuntimeInitialized(): void {
  runtimeInitialized = true;
}

export function hasGrantedPermission(): boolean {
  return getDownloadNotificationPermission() === 'granted';
}

export async function ensureChannelsReady(): Promise<void> {
  if (!isAndroid()) {
    return;
  }

  if (!channelsPromise) {
    channelsPromise = createDownloadChannels().catch((error) => {
      channelsPromise = null;
      throw error;
    });
  }

  await channelsPromise;
}

export function toNativeActiveDownload(item: QueueItem): NativeActiveDownloadPayload {
  return {
    id: item.id,
    title: item.input.title,
    artist: item.input.artist,
    progress: Math.max(0, Math.min(item.progress, 1)),
    status: item.status as NativeActiveDownloadPayload['status'],
  };
}
