import type { CloudSyncOrigin } from '@ton/core';
import type { MobileCloudSyncMode } from './v2-common';

export function shouldRunManualCloudRepair(
  origin: CloudSyncOrigin,
  mode: MobileCloudSyncMode,
): boolean {
  return origin === 'manual' && mode === 'upload';
}
