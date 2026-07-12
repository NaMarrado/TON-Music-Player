import { useMemo } from 'react';
import type { DownloadItem } from '@ton/core';
import { useDownloadRuntimeMeta } from '../../../stores/download-store';

export function useDownloadProgressView(item: DownloadItem) {
  const runtimeMeta = useDownloadRuntimeMeta(item.id);

  return useMemo(() => {
    const isIndeterminate = runtimeMeta?.indeterminate ?? false;
    const progressPercent = Number.isFinite(item.progress)
      ? Math.max(0, Math.min(100, Math.round(item.progress * 100)))
      : 0;

    return {
      isIndeterminate,
      progressPercent,
      runtimeMeta,
    };
  }, [item.progress, runtimeMeta]);
}

