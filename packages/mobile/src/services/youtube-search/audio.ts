import { Platform } from 'react-native';
import { isWebViewReady, waitForWebViewReady } from '../js-evaluator';
import {
  getAudioUrlViaAndroid,
  getAudioUrlViaAndroidVR,
  getAudioUrlViaIos,
  getAudioUrlViaMweb,
} from './audio-strategies';
import { isIosCompatibleAudioMimeType } from './audio-strategies/format-helpers';
import { validateIosAudioCandidate } from './audio-strategies/validation';
import { getPlayerClient, resetPlayerClient } from './client';
import { getErrorMessage } from './errors';
import type { ResolvedAudioUrl } from './types';

type AudioStrategyName = 'MWEB' | 'IOS' | 'ANDROID' | 'ANDROID_VR' | 'WEB';
type AudioStrategyResolver = (videoId: string) => Promise<ResolvedAudioUrl>;
type ResolvedAudioCandidate = ResolvedAudioUrl & { strategy: AudioStrategyName };

interface GetYouTubeAudioUrlOptions {
  skipStrategies?: readonly string[];
}

type PlayerFormat = {
  has_audio?: boolean;
  has_video?: boolean;
  url?: string;
  signature_cipher?: string;
  cipher?: string;
};

function ensurePlatformCompatibleAudio(
  strategy: string,
  resolved: ResolvedAudioUrl,
): ResolvedAudioUrl {
  if (Platform.OS !== 'ios') {
    return resolved;
  }

  if (!isIosCompatibleAudioMimeType(resolved.mimeType)) {
    throw new Error(`${strategy}: incompatible iOS audio format (${resolved.mimeType})`);
  }

  return resolved;
}

function strategyRequiresPoToken(strategy: AudioStrategyName): boolean {
  return strategy === 'MWEB' || strategy === 'IOS' || strategy === 'WEB';
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
      strategy,
    };
  } catch (error) {
    const message = getErrorMessage(error);
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
        ['MWEB', getAudioUrlViaMweb],
        ['IOS', (id) => getAudioUrlViaIos(id, { requirePoToken: true })],
        ['ANDROID', (id) => getAudioUrlViaAndroid(id, { requireIosCompatibleFormat: true })],
        ['ANDROID_VR', getAudioUrlViaAndroidVR],
      ] as const
    : [
        ['ANDROID_VR', getAudioUrlViaAndroidVR],
        ['ANDROID', getAudioUrlViaAndroid],
        ['IOS', (id) => getAudioUrlViaIos(id, { requirePoToken: false })],
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

  const shouldTryWebFallback = Platform.OS !== 'ios'
    && !skippedStrategies.has('WEB')
    && isWebViewReady();
  const webFallbackReady = shouldTryWebFallback;

  if (webFallbackReady) {
    try {
      console.log('[YT-AUDIO] Trying WEB client with po_token for', videoId);
      const yt = await getPlayerClient({ useSessionPoToken: true });
      const info = await yt.getBasicInfo(videoId);

      if (info.streaming_data) {
        const adaptiveFormats = info.streaming_data.adaptive_formats || [];
        const audioFormats = adaptiveFormats.filter(
          (format: PlayerFormat) => format.has_audio && !format.has_video,
        );
        const formatsWithUrl = adaptiveFormats.filter(
          (format: PlayerFormat) => format.url || format.signature_cipher || format.cipher,
        );
        console.log(
          '[YT-AUDIO] WEB formats:',
          adaptiveFormats.length,
          'audio-only:',
          audioFormats.length,
          'with-url:',
          formatsWithUrl.length,
        );
        if (formatsWithUrl.length === 0) {
          errors.push('WEB: SABR-only (no URLs in formats)');
          throw new Error('SABR-only response - no decodable URLs');
        }
      }

      const format = await yt.getStreamingData(videoId, {
        type: 'audio',
        quality: 'best',
      });

      if (format.url) {
        console.log(
          '[YT-AUDIO] WEB+po_token success! itag:',
          format.itag,
          'size:',
          format.content_length,
        );
        return {
          ...(await finalizeCandidateForPlatform('WEB', {
            url: format.url,
            mimeType: format.mime_type || 'audio/webm',
            contentLength: format.content_length ? Number(format.content_length) : 0,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
          })),
          strategy: 'WEB',
        };
      }

      errors.push('WEB: no URL after decipher');
    } catch (error) {
      const message = getErrorMessage(error);
      console.warn('[YT-AUDIO] WEB client failed:', message);
      if (!errors.some((entry) => entry.startsWith('WEB:'))) {
        errors.push(`WEB: ${message}`);
      }
      resetPlayerClient();
    }
  }

  throw new Error(`Could not resolve audio URL: ${errors.join('; ')}`);
}
