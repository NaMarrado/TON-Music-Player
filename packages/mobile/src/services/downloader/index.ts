import { cleanupFailedDownload, ensureMusicDir, nativeDownload } from './filesystem';
import type {
  DownloadInput,
  DownloadResult,
  DownloadRuntimeOptions,
} from './types';
import {
  finalizeDownloadedTrack,
  type DownloadFinalizeInput,
} from './finalize';
import {
  prepareDownloadSource,
} from './prepare';

export { ensureMusicDir } from './filesystem';
export { finalizeDownloadedTrack } from './finalize';
export type { DownloadFinalizeInput } from './finalize';
export { prepareDownloadSource } from './prepare';
export type { PreparedDownloadSource } from './prepare';
export type { DownloadFormat, DownloadInput, DownloadResult } from './types';

export async function downloadTrack(
  input: DownloadInput,
  options: DownloadRuntimeOptions = {},
): Promise<DownloadResult> {
  const { isCancelled, onCancelable, onProgress, onResolved } = options;
  await ensureMusicDir();

  const resolved = await prepareDownloadSource(input);
  await onResolved?.(resolved);
  if (isCancelled?.()) {
    await cleanupFailedDownload(resolved.filePath);
    throw new Error('download_cancelled');
  }

  console.log('[DL] Starting native download to', resolved.filePath);
  const downloadResult = await nativeDownload(
    resolved.url,
    resolved.filePath,
    resolved.headers,
    (loaded, total) => {
      onProgress?.(Math.min(loaded / total, 0.95));
    },
    onCancelable,
  );

  if (!downloadResult || isCancelled?.()) {
    await cleanupFailedDownload(resolved.filePath);
    throw new Error('download_cancelled');
  }

  console.log(
    '[DL] Native download status:',
    downloadResult.status,
    'headers:',
    JSON.stringify(downloadResult.headers).slice(0, 200),
  );

  if (downloadResult.status !== 200 && downloadResult.status !== 206) {
    await cleanupFailedDownload(resolved.filePath);
    throw new Error(`Download failed: HTTP ${downloadResult.status}`);
  }

  onProgress?.(1);

  return finalizeDownloadedTrack(
    resolved as DownloadFinalizeInput,
    input,
    { isCancelled },
  );
}
