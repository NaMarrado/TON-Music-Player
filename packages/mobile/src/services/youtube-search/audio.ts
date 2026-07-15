import { Platform } from 'react-native';
import {
  AGE_RESTRICTED_DOWNLOAD_MESSAGE,
  isAgeRestrictedDownloadError,
} from '@ton/core';
import { isWebViewReady, waitForWebViewReady } from '../js-evaluator';
import {
  getAudioUrlViaAndroid,
  getAudioUrlViaAndroidVR,
  getAudioUrlViaIos,
  getAudioUrlViaMweb,
} from './audio-strategies';
import { isAacM4aAudioMimeType } from './audio-strategies/format-helpers';
import { validateIosAudioCandidate } from './audio-strategies/validation';
import {
  getAndroidCandidateViolation,
  type AndroidAudioStrategy,
} from './audio-strategies/android-candidate-policy';
import { invalidateAndroidVrVisitorData } from './audio-strategies/android-vr-visitor-session';
import { invalidatePoToken } from '../po-token-service';
import { resetPlayerClient } from './client';
import {
  getErrorMessage,
  isYouTubeResolverError,
  YouTubeResolverError,
} from './errors';
import type { ResolvedAudioUrl } from './types';

export type AudioStrategyName = 'MWEB' | 'IOS' | 'ANDROID' | 'ANDROID_VR';
type AudioStrategyResolver = (videoId: string) => Promise<ResolvedAudioUrl>;
export type ResolvedAudioCandidate = ResolvedAudioUrl & {
  client: AudioStrategyName;
  strategy: AudioStrategyName;
};

export interface GetYouTubeAudioUrlOptions {
  forceFreshStrategies?: readonly string[];
  signal?: AbortSignal;
  skipStrategies?: readonly string[];
}

function ensureAndroidCandidate(
  strategy: AudioStrategyName,
  resolved: ResolvedAudioUrl,
): ResolvedAudioUrl {
  if (strategy !== 'ANDROID_VR' && strategy !== 'MWEB') {
    throw new YouTubeResolverError({
      message: `${strategy} is not allowed by the Android audio policy`,
      stage: 'candidate',
      strategy,
    });
  }

  const violation = getAndroidCandidateViolation(
    strategy as AndroidAudioStrategy,
    resolved,
  );
  if (violation) {
    throw new YouTubeResolverError({
      message: violation,
      stage: 'candidate',
      strategy,
    });
  }

  return resolved;
}

function ensurePlatformCompatibleAudio(
  strategy: string,
  resolved: ResolvedAudioUrl,
): ResolvedAudioUrl {
  if (Platform.OS === 'android') {
    return ensureAndroidCandidate(strategy as AudioStrategyName, resolved);
  }

  if (Platform.OS !== 'ios') {
    return resolved;
  }

  if (!isAacM4aAudioMimeType(resolved.mimeType)) {
    throw new Error(`${strategy}: incompatible AAC/M4A audio format (${resolved.mimeType})`);
  }

  return resolved;
}

function strategyRequiresPoToken(strategy: AudioStrategyName): boolean {
  return strategy === 'MWEB';
}

async function finalizeCandidateForPlatform(
  strategy: AudioStrategyName,
  resolved: ResolvedAudioUrl,
): Promise<ResolvedAudioUrl> {
  const compatible = ensurePlatformCompatibleAudio(strategy, resolved);

  if (Platform.OS !== 'ios') {
    return compatible;
  }

  if (strategyRequiresPoToken(strategy)) {
    const url = new URL(compatible.url);
    if (!url.searchParams.has('pot')) {
      throw new Error(`${strategy}: missing GVS PO token`);
    }
  }

  return validateIosAudioCandidate(strategy, compatible);
}

async function tryAudioStrategy(
  videoId: string,
  strategy: AudioStrategyName,
  resolver: AudioStrategyResolver,
  errors: string[],
): Promise<ResolvedAudioCandidate | null> {
  try {
    console.log(`[YT-AUDIO] Trying ${strategy} for`, videoId);
    return {
      ...(await finalizeCandidateForPlatform(strategy, await resolver(videoId))),
      client: strategy,
      strategy,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    if (
      message === 'download_cancelled'
      || (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new Error('download_cancelled');
    }
    if (isAgeRestrictedDownloadError(message)) {
      throw new Error(AGE_RESTRICTED_DOWNLOAD_MESSAGE);
    }
    if (isYouTubeResolverError(error) && error.status === 429) {
      console.log(`[YT-AUDIO] ${strategy} rate limited; stopping provider resolution`);
      throw error;
    }
    console.log(`[YT-AUDIO] ${strategy} rejected:`, message);
    errors.push(`${strategy}: ${message}`);
    return null;
  }
}

export async function getYouTubeAudioUrl(
  videoId: string,
  options: GetYouTubeAudioUrlOptions = {},
): Promise<ResolvedAudioCandidate> {
  const errors: string[] = [];
  const forceFreshStrategies = new Set(options.forceFreshStrategies ?? []);
  const skippedStrategies = new Set(options.skipStrategies ?? []);

  if (Platform.OS === 'ios' && !isWebViewReady()) {
    try {
      await waitForWebViewReady();
    } catch (error) {
      console.log('[YT-AUDIO] iOS po_token WebView not ready:', getErrorMessage(error));
    }
  }

  const strategyOrder: readonly (readonly [AudioStrategyName, AudioStrategyResolver])[] = Platform.OS === 'ios'
    ? [
        ['MWEB', (id) => getAudioUrlViaMweb(id, {
          forceFresh: forceFreshStrategies.has('MWEB'),
          platform: 'ios',
          signal: options.signal,
        })],
        ['IOS', getAudioUrlViaIos],
        ['ANDROID', (id) => getAudioUrlViaAndroid(id, { requireIosCompatibleFormat: true })],
        ['ANDROID_VR', (id) => getAudioUrlViaAndroidVR(id, {
          forceFreshVisitor: forceFreshStrategies.has('ANDROID_VR'),
          signal: options.signal,
        })],
      ] as const
    : [
        ['ANDROID_VR', (id) => getAudioUrlViaAndroidVR(id, {
          forceFreshVisitor: forceFreshStrategies.has('ANDROID_VR'),
          signal: options.signal,
        })],
        ['MWEB', (id) => getAudioUrlViaMweb(id, {
          forceFresh: forceFreshStrategies.has('MWEB'),
          platform: 'android',
          signal: options.signal,
        })],
      ] as const;

  for (const [strategy, resolver] of strategyOrder) {
    if (skippedStrategies.has(strategy)) {
      continue;
    }

    const resolved = await tryAudioStrategy(videoId, strategy, resolver, errors);
    if (resolved) {
      return resolved;
    }
  }

  throw new YouTubeResolverError({
    message: `[provider_exhausted] Could not resolve audio URL: ${errors.join('; ')}`,
    stage: 'candidate',
    strategy: 'ALL',
  });
}

export function invalidateYouTubeAudioStrategy(
  strategy: AudioStrategyName,
  videoId: string,
): void {
  if (strategy === 'ANDROID_VR') {
    invalidateAndroidVrVisitorData();
    return;
  }

  if (strategy === 'MWEB') {
    invalidatePoToken();
    resetPlayerClient();
    return;
  }

  if (strategy === 'IOS') {
    invalidatePoToken({ binding: 'video', videoId });
  }
}
