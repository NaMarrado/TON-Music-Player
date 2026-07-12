import { waitForWebViewReady } from '../../js-evaluator';
import {
  getPoToken,
  invalidatePoToken,
  isPoTokenReady,
} from '../../po-token-service';
import { getPlayerClient, resetPlayerClient } from '../client';
import { MWEB_ANDROID_UA, MWEB_IOS_UA } from '../constants';
import { YouTubeResolverError, isYouTubeResolverError } from '../errors';
import type { ResolvedAudioUrl } from '../types';
import { isIosCompatibleAudioMimeType, toContentLength } from './format-helpers';
import { validateAndroidMwebCandidate } from './validation';

type StreamingFormat = {
  content_length?: number | string;
  itag?: number;
  mime_type?: string;
  url?: string;
};

export interface MwebResolutionOptions {
  forceFresh?: boolean;
  platform?: 'android' | 'ios';
  signal?: AbortSignal;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('download_cancelled');
  }
}

function resetMwebSession(): void {
  invalidatePoToken();
  resetPlayerClient();
}

async function resolveMwebCandidate(
  videoId: string,
  platform: 'android' | 'ios',
  signal?: AbortSignal,
): Promise<ResolvedAudioUrl> {
  throwIfCancelled(signal);
  if (!isPoTokenReady()) {
    await waitForWebViewReady();
  }
  throwIfCancelled(signal);

  // BotGuard's streaming token must be minted first, then the video-bound
  // token from the same minter is used by both player and GVS requests.
  const initializationToken = await getPoToken({ binding: 'session' });
  const videoToken = await getPoToken({
    binding: 'video',
    videoId,
    visitorData: initializationToken.visitorData,
  });
  throwIfCancelled(signal);

  const yt = await getPlayerClient({
    cacheKey: `mweb:${videoId}:${videoToken.poToken}`,
    poToken: videoToken.poToken,
    visitorData: initializationToken.visitorData,
  });
  const info = await yt.getBasicInfo(videoId, {
    client: 'MWEB',
    po_token: videoToken.poToken,
  } as never);
  const format = info.chooseFormat({
    codec: 'mp4a',
    format: 'mp4',
    quality: 'best',
    type: 'audio',
  }) as StreamingFormat & {
    decipher(player: NonNullable<typeof yt.session.player>): Promise<string>;
  };

  const player = yt.session.player;
  if (!player) {
    throw new YouTubeResolverError({
      canRefresh: true,
      message: 'MWEB player decipher runtime unavailable',
      stage: 'decipher',
      strategy: 'MWEB',
    });
  }

  player.po_token = videoToken.poToken;
  const finalUrl = await format.decipher(player);
  if (!finalUrl) {
    throw new YouTubeResolverError({
      canRefresh: true,
      message: 'MWEB player returned no final URL',
      stage: 'decipher',
      strategy: 'MWEB',
    });
  }

  const parsedUrl = new URL(finalUrl);
  parsedUrl.searchParams.set('pot', videoToken.poToken);

  const mimeType = format.mime_type || 'audio/mp4';
  if (!isIosCompatibleAudioMimeType(mimeType)) {
    throw new YouTubeResolverError({
      message: `MWEB returned incompatible audio format (${mimeType})`,
      stage: 'candidate',
      strategy: 'MWEB',
    });
  }

  console.log(
    '[YT-AUDIO] MWEB BotGuard success, itag:',
    format.itag,
    'mime:',
    mimeType,
  );

  return {
    url: parsedUrl.toString(),
    mimeType,
    contentLength: toContentLength(format.content_length),
    headers: {
      Accept: '*/*',
      'Accept-Encoding': 'identity',
      'User-Agent': platform === 'android' ? MWEB_ANDROID_UA : MWEB_IOS_UA,
    },
  };
}

export async function getAudioUrlViaMweb(
  videoId: string,
  options: MwebResolutionOptions = {},
): Promise<ResolvedAudioUrl> {
  const platform = options.platform ?? 'ios';
  const attempts = platform === 'android' ? 2 : 1;
  const attemptedUrls = new Set<string>();

  if (options.forceFresh) {
    resetMwebSession();
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      resetMwebSession();
    }

    try {
      const candidate = await resolveMwebCandidate(videoId, platform, options.signal);
      if (attemptedUrls.has(candidate.url)) {
        throw new YouTubeResolverError({
          message: 'MWEB refresh returned the same rejected media URL',
          stage: 'candidate',
          strategy: 'MWEB',
        });
      }
      attemptedUrls.add(candidate.url);

      return platform === 'android'
        ? await validateAndroidMwebCandidate(candidate, options.signal)
        : candidate;
    } catch (error) {
      lastError = error;
      throwIfCancelled(options.signal);
      if (attempt + 1 >= attempts) {
        throw error;
      }
      if (isYouTubeResolverError(error) && !error.canRefresh) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('MWEB resolution failed');
}
