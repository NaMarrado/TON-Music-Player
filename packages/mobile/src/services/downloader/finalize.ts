import * as FileSystem from 'expo-file-system';
import { cleanupFailedDownload } from './filesystem';
import { persistDownloadedTrack } from './persist';
import type { DownloadFormat, DownloadInput, DownloadResult } from './types';
import { scheduleMobileJob } from '../job-scheduler';
import { scheduleTrackLoudnessAnalysis } from '../loudness-analysis';
import { normalizeDownloadedAudioForPlayback } from '../audio-normalization';

export interface DownloadFinalizeInput {
  coverUrl: string | null;
  contentLength: number;
  filePath: string;
  format: DownloadFormat;
  safeName: string;
  videoId: string;
}

export interface DownloadFinalizeOptions {
  isCancelled?: () => boolean;
  onCancelable?: (cancel: () => Promise<void>) => void;
}

export async function finalizeDownloadedTrack(
  prepared: DownloadFinalizeInput,
  input: DownloadInput,
  options: DownloadFinalizeOptions = {},
): Promise<DownloadResult> {
  const { isCancelled, onCancelable } = options;

  if (isCancelled?.()) {
    await cleanupFailedDownload(prepared.filePath);
    throw new Error('download_cancelled');
  }

  const normalized = await normalizeDownloadedAudioForPlayback({
    filePath: prepared.filePath,
    format: prepared.format,
  }, {
    qualityProfile: input.qualityProfile ?? 'normal',
    onCancelable,
  });

  if (isCancelled?.()) {
    await cleanupFailedDownload(normalized.filePath);
    throw new Error('download_cancelled');
  }

  const fileInfo = await FileSystem.getInfoAsync(normalized.filePath, { size: true });
  const fileSize =
    fileInfo.exists && typeof fileInfo.size === 'number'
      ? fileInfo.size
      : prepared.contentLength;

  console.log('[DL] File written:', normalized.filePath, 'size:', fileSize);
  if (fileSize < 1000) {
    await cleanupFailedDownload(normalized.filePath);
    throw new Error(`Download too small (${fileSize} bytes), likely blocked`);
  }

  if (isCancelled?.()) {
    await cleanupFailedDownload(normalized.filePath);
    throw new Error('download_cancelled');
  }

  const trackId = await scheduleMobileJob({
    kind: 'download-postprocess',
    lane: 'archive-io',
    priority: 'background',
    run: () => persistDownloadedTrack({
      coverUrl: prepared.coverUrl,
      filePath: normalized.filePath,
      fileSize,
      format: normalized.format,
      input,
      safeName: prepared.safeName,
      videoId: prepared.videoId,
    }),
  });
  scheduleTrackLoudnessAnalysis(trackId);

  return { trackId, filePath: normalized.filePath };
}
