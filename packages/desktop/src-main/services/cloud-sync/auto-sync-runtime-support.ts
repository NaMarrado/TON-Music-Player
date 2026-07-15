import { BrowserWindow } from 'electron';
import { normalizeCloudStorageErrorKey } from '@ton/core';
import { getActiveDesktopCloudScope, readDesktopCloudOutbox } from './auto-sync-store';

export function broadcastCloudEvent(
  channel: 'cloud:state' | 'cloud:applied' | 'cloud:progress',
  payload: unknown,
): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

export function getDesktopCloudPendingCount(): number {
  const scopeId = getActiveDesktopCloudScope();
  return scopeId ? readDesktopCloudOutbox(scopeId).length : 0;
}

export function classifyDesktopCloudError(
  error: unknown,
): 'transient' | 'permanent' | 'cancelled' {
  if (error instanceof Error) {
    if (error.message === 'cloud_sync_cancelled' || error.name === 'AbortError') {
      return 'cancelled';
    }
    const normalized = normalizeCloudStorageErrorKey(error.message);
    if (
      (normalized != null && normalized !== 'cloudStorageErrorConnectionFailed')
      || /not configured|secure storage|invalid manifest|cloud_sync_invalid_v2_manifest|cloud_sync_v2_manifest_missing/i.test(error.message)
    ) {
      return 'permanent';
    }
  }
  return 'transient';
}
