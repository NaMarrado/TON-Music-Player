import { Platform } from 'react-native';
import { cleanupFailedDownload, ensureMusicDir, nativeDownload } from './filesystem';
import {
  invalidateYouTubeAudioStrategy,
  type AudioStrategyName,
} from '../youtube-search';
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
  ANDROID_PROVIDER_ATTEMPT_LIMIT,
  getAndroidProviderRecoveryAction,
} from './android-provider-recovery';
import {
  prepareDownloadSource,
} from './prepare';

export { ensureMusicDir } from './filesystem';
export { finalizeDownloadedTrack } from './finalize';
export type { DownloadFinalizeInput } from './finalize';
export { prepareDownloadSource } from './prepare';
export type { PreparedDownloadSource } from './prepare';
export type { DownloadFormat, DownloadInput, DownloadResult } from './types';

function isSuccessfulDownloadStatus(status: number): boolean {
  return status === 200 || status === 206;
}

function getProviderAttemptLimit(): number {
  return Platform.OS === 'android' ? ANDROID_PROVIDER_ATTEMPT_LIMIT : 1;
}

export async function downloadTrack(
  input: DownloadInput,
  options: DownloadRuntimeOptions = {},
): Promise<DownloadResult> {
  const { isCancelled, onCancelable, onProgress, onResolved } = options;
  let cancelRequested = false;
  let nativeCancel: (() => Promise<void>) | null = null;
  let postprocessCancel: (() => Promise<void>) | null = null;
  let resolveController: AbortController | null = null;

  onCancelable?.(async () => {
    cancelRequested = true;
    resolveController?.abort();
    const cancel = nativeCancel;
    nativeCancel = null;
    await cancel?.().catch(() => {});
    const cancelPostprocess = postprocessCancel;
    postprocessCancel = null;
    await cancelPostprocess?.().catch(() => {});
  });

  await ensureMusicDir();
  const attemptedUrls = new Set<string>();
  const forceFreshStrategies = new Set<AudioStrategyName>();
  const skippedStrategies = new Set<AudioStrategyName>();
  const providerAttemptLimit = getProviderAttemptLimit();

  for (let attempt = 0; attempt < providerAttemptLimit; attempt += 1) {
    if (cancelRequested || isCancelled?.()) {
      throw new Error('download_cancelled');
    }

    resolveController = new AbortController();
    const currentResolveController = resolveController;
    const resolved = await prepareDownloadSource(input, {
      forceFreshStrategies: [...forceFreshStrategies],
      signal: currentResolveController.signal,
      skipStrategies: [...skippedStrategies],
    }).finally(() => {
      if (resolveController === currentResolveController) {
        resolveController = null;
      }
    });

    if (cancelRequested || isCancelled?.()) {
      await cleanupFailedDownload(resolved.filePath);
      throw new Error('download_cancelled');
    }

    if (attemptedUrls.has(resolved.url)) {
      skippedStrategies.add(resolved.strategy);
      forceFreshStrategies.delete(resolved.strategy);
      if (attempt + 1 < providerAttemptLimit) {
        continue;
      }
      throw new Error('[provider_exhausted] Resolver returned a previously rejected media URL');
    }
    attemptedUrls.add(resolved.url);

    await onResolved?.(resolved);
    console.log(
      '[DL] Starting native audio download via',
      resolved.strategy,
      'to',
      resolved.filePath,
    );
    const downloadResult = await nativeDownload(
      resolved.url,
      resolved.filePath,
      resolved.headers,
      (loaded, total) => {
        onProgress?.(Math.min(loaded / total, 0.95));
      },
      (cancel) => {
        nativeCancel = cancel;
        if (cancelRequested || isCancelled?.()) {
          void cancel().catch(() => {});
        }
      },
    ).catch(async (error) => {
      await cleanupFailedDownload(resolved.filePath);
      throw error;
    }).finally(() => {
      nativeCancel = null;
    });

    if (!downloadResult || cancelRequested || isCancelled?.()) {
      await cleanupFailedDownload(resolved.filePath);
      throw new Error('download_cancelled');
    }

    console.log(
      '[DL] Native download status:',
      downloadResult.status,
      'strategy:',
      resolved.strategy,
    );

    if (isSuccessfulDownloadStatus(downloadResult.status)) {
      onProgress?.(1);
      return finalizeDownloadedTrack(
        resolved as DownloadFinalizeInput,
        input,
        {
          isCancelled: () => cancelRequested || isCancelled?.() === true,
          onCancelable: (cancel) => {
            postprocessCancel = cancel;
            if (cancelRequested || isCancelled?.()) void cancel().catch(() => {});
          },
        },
      );
    }

    await cleanupFailedDownload(resolved.filePath);

    const recoveryAction = Platform.OS === 'android'
      ? getAndroidProviderRecoveryAction({
          attempt,
          forceFresh: forceFreshStrategies.has(resolved.strategy),
          status: downloadResult.status,
          strategy: resolved.strategy,
        })
      : 'stop-http';

    if (recoveryAction === 'stop-rate-limited') {
      throw new Error('[provider_rate_limited] Download failed: HTTP 429');
    }
    if (recoveryAction === 'stop-exhausted') {
      throw new Error(`[provider_exhausted] Download failed: HTTP ${downloadResult.status}`);
    }
    if (recoveryAction === 'stop-http') {
      throw new Error(`Download failed: HTTP ${downloadResult.status}`);
    }

    invalidateYouTubeAudioStrategy(resolved.strategy, resolved.videoId);
    if (recoveryAction === 'refresh-android-vr') {
      forceFreshStrategies.add('ANDROID_VR');
    } else if (recoveryAction === 'fallback-mweb') {
      skippedStrategies.add('ANDROID_VR');
      forceFreshStrategies.delete('ANDROID_VR');
      forceFreshStrategies.add('MWEB');
    } else if (recoveryAction === 'refresh-mweb') {
      forceFreshStrategies.add('MWEB');
    }

    console.log(
      '[DL] Media URL rejected with HTTP 403; resolving a fresh candidate, attempt',
      attempt + 2,
      'of',
      providerAttemptLimit,
    );
  }

  throw new Error('[provider_exhausted] Android audio provider attempt budget exhausted');
}
