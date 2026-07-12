const VOLUME_DEBUG =
  __DEV__ && process.env.EXPO_PUBLIC_TON_VOLUME_DEBUG === '1';

let lastPreviewPercent: number | null = null;

export function logVolumeDebug(event: string, detail?: Record<string, unknown>): void {
  if (!VOLUME_DEBUG) {
    return;
  }

  if (detail) {
    console.log('[VOL][mobile]', event, detail);
  } else {
    console.log('[VOL][mobile]', event);
  }
}

export function logVolumePreview(percent: number): void {
  if (!VOLUME_DEBUG) {
    return;
  }

  const rounded = Math.round(percent);
  if (lastPreviewPercent === rounded) {
    return;
  }

  lastPreviewPercent = rounded;
  logVolumeDebug('preview', { percent: rounded });
}
