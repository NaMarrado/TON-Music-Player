import { ANDROID_MEDIA_UA } from '../constants';
import { YouTubeResolverError } from '../errors';
import type { ResolvedAudioUrl } from '../types';
import { toContentLength } from './format-helpers';
import {
  decipherCipherUrlStrict,
  decipherNParamStrict,
} from './player-decipher';
import {
  ANDROID_VR_CLIENT,
  createAndroidVrContext,
  createAndroidVrHeaders,
  selectBestAndroidVrAudioFormat,
} from './android-vr-protocol';
import {
  getAndroidVrVisitorData,
  invalidateAndroidVrVisitorData,
} from './android-vr-visitor-session';
import type { RawPlayerResponse } from './types';

export interface AndroidVrResolutionOptions {
  forceFreshVisitor?: boolean;
  signal?: AbortSignal;
}

function getPlayabilityError(data: RawPlayerResponse): string {
  return data.playabilityStatus?.reason
    || data.playabilityStatus?.status
    || 'Not playable';
}

async function requestAndroidVrPlayer(
  videoId: string,
  visitorData: string,
  signal?: AbortSignal,
): Promise<RawPlayerResponse> {
  const response = await fetch(
    `${ANDROID_VR_CLIENT.apiBaseUrl}/player?prettyPrint=false`,
    {
      body: JSON.stringify({
        context: createAndroidVrContext(visitorData),
        contentCheckOk: true,
        racyCheckOk: true,
        videoId,
      }),
      headers: createAndroidVrHeaders(visitorData),
      method: 'POST',
      signal,
    },
  );

  if (!response.ok) {
    throw new YouTubeResolverError({
      canRefresh: response.status !== 429,
      message: `ANDROID_VR player returned HTTP ${response.status}`,
      stage: 'player',
      status: response.status,
      strategy: 'ANDROID_VR',
    });
  }

  return response.json() as Promise<RawPlayerResponse>;
}

export async function getAudioUrlViaAndroidVR(
  videoId: string,
  options: AndroidVrResolutionOptions = {},
): Promise<ResolvedAudioUrl> {
  let forceFreshVisitor = options.forceFreshVisitor ?? false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const visitorData = await getAndroidVrVisitorData({
      forceFresh: forceFreshVisitor,
      signal: options.signal,
    });
    const data = await requestAndroidVrPlayer(videoId, visitorData, options.signal);

    if (data.playabilityStatus?.status !== 'OK') {
      const canRefresh = data.playabilityStatus?.status === 'LOGIN_REQUIRED';
      if (canRefresh && attempt === 0) {
        invalidateAndroidVrVisitorData();
        forceFreshVisitor = true;
        continue;
      }

      throw new YouTubeResolverError({
        canRefresh,
        message: `ANDROID_VR player rejected video: ${getPlayabilityError(data)}`,
        stage: 'player',
        strategy: 'ANDROID_VR',
      });
    }

    const streamingData = data.streamingData;
    if (!streamingData) {
      throw new YouTubeResolverError({
        message: 'ANDROID_VR player response contained no streamingData',
        stage: 'player',
        strategy: 'ANDROID_VR',
      });
    }

    const best = selectBestAndroidVrAudioFormat(streamingData);
    if (!best) {
      const audioCount = (streamingData.adaptiveFormats ?? []).filter(
        (format) => format.mimeType?.toLowerCase().startsWith('audio/'),
      ).length;
      throw new YouTubeResolverError({
        message: `ANDROID_VR returned no direct audio URL (${audioCount} audio formats)`,
        stage: 'candidate',
        strategy: 'ANDROID_VR',
      });
    }

    let finalUrl = best.url;
    if (!finalUrl) {
      finalUrl = await decipherCipherUrlStrict(
        'ANDROID_VR',
        best.signatureCipher,
        best.cipher,
        { cacheKey: 'android-vr-player' },
      );
    }

    finalUrl = await decipherNParamStrict(
      finalUrl,
      'ANDROID_VR',
      { cacheKey: 'android-vr-player' },
    );

    const parsedUrl = new URL(finalUrl);
    parsedUrl.searchParams.delete('pot');

    console.log(
      '[YT-AUDIO] ANDROID_VR direct success, itag:',
      best.itag,
      'bitrate:',
      best.bitrate,
      'mime:',
      best.mimeType,
    );

    return {
      url: parsedUrl.toString(),
      mimeType: best.mimeType || 'audio/mp4',
      contentLength: toContentLength(best.contentLength),
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'identity',
        'User-Agent': ANDROID_MEDIA_UA,
      },
    };
  }

  throw new YouTubeResolverError({
    message: 'ANDROID_VR visitor refresh budget exhausted',
    stage: 'player',
    strategy: 'ANDROID_VR',
  });
}
