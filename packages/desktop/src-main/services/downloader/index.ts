import type { DownloadItem } from '@ton/core';
import { createProgressBridge } from './progress-bridge';
import { importDownloadedTrack } from './library-import';
import { downloadWithYtDlp } from './download-process';
import { markDownloadDone, updateDownloadStatus } from './status';
import { resolveDownloadUrl } from './resolve';
import type { DownloadCallbacks } from './types';
import { scheduleMainProcessJob } from '../job-scheduler';

export type { DownloadCallbacks } from './types';

export async function downloadItem(
  item: DownloadItem,
  callbacks: DownloadCallbacks,
  abortSignal: AbortSignal,
): Promise<void> {
  const progressBridge = createProgressBridge(item.id, callbacks);

  try {
    const resolved = await scheduleMainProcessJob({
      kind: 'download-resolve',
      lane: 'network',
      priority: 'user-visible',
      run: () => resolveDownloadUrl(item, callbacks, abortSignal),
    });
    if (abortSignal.aborted) {
      return;
    }

    updateDownloadStatus(item.id, 'downloading');
    progressBridge.emitDownloadStarted();

    const outputFile = await downloadWithYtDlp(item, resolved.url, abortSignal, progressBridge);
    if (abortSignal.aborted) {
      return;
    }

    const imported = await scheduleMainProcessJob({
      kind: 'download-postprocess',
      lane: 'cpu-heavy',
      priority: 'background',
      run: () => importDownloadedTrack(item, outputFile, resolved),
    });
    if (abortSignal.aborted || !markDownloadDone(item.id)) {
      return;
    }

    callbacks.onComplete({
      filePath: outputFile,
      id: item.id,
      playlistIds: imported.playlistIds,
      trackId: imported.trackId,
    });
  } catch (error: unknown) {
    if (abortSignal.aborted) {
      return;
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
