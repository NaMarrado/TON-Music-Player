import {
  DEFAULT_VOLUME_PERCENT,
  resolveStoredVolumePercent,
} from '@ton/core';
import { logVolumeDebug } from './volume-debug';

const ipc = window.api.invoke as (...args: unknown[]) => Promise<unknown>;

export async function readPersistedVolumePercent(): Promise<number> {
  try {
    const [volumePercentValue, legacyVolumeValue] = await Promise.all([
      ipc('settings:get', 'volume_percent') as Promise<string | null>,
      ipc('settings:get', 'volume') as Promise<string | null>,
    ]);

    const resolved = resolveStoredVolumePercent(volumePercentValue, legacyVolumeValue);
    logVolumeDebug('restore:resolved', {
      source: resolved.source,
      volumePercent: resolved.volumePercent,
      shouldPersist: resolved.shouldPersist,
    });
    if (resolved.shouldPersist) {
      persistVolumePercent(resolved.volumePercent);
    }

    return resolved.volumePercent;
  } catch {
    return DEFAULT_VOLUME_PERCENT;
  }
}

export function persistVolumePercent(volumePercent: number): void {
  logVolumeDebug('persist', { volumePercent });
  void ipc('settings:set', 'volume_percent', String(volumePercent));
}
