import { getPoToken, isPoTokenReady } from '../../po-token-service';
import { ANDROID_VR_UA, ANDROID_VR_VERSION, CDN_UA } from '../constants';
import type { ResolvedAudioUrl } from '../types';
import {
  getAudioFormats,
  sortFormatsByBitrateDescending,
  toContentLength,
} from './format-helpers';
import { maybeDecipherNParam } from './player-decipher';
import type { RawPlayerResponse } from './types';

export async function getAudioUrlViaAndroidVR(
  videoId: string,
): Promise<ResolvedAudioUrl> {
  let visitorData: string | undefined;
  if (isPoTokenReady()) {
    try {
      const token = await getPoToken();
      visitorData = token.visitorData;
    } catch {
      // Continue without visitor data.
    }
  }

  const extraHeaders: Record<string, string> = {};
  if (visitorData) {
    extraHeaders['X-Goog-Visitor-Id'] = visitorData;
  }

  const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': ANDROID_VR_UA,
      'X-YouTube-Client-Name': '28',
      'X-YouTube-Client-Version': ANDROID_VR_VERSION,
      ...extraHeaders,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'ANDROID_VR',
          clientVersion: ANDROID_VR_VERSION,
          deviceMake: 'Oculus',
          deviceModel: 'Quest 3',
          androidSdkVersion: 32,
          osName: 'Android',
          osVersion: '12L',
          userAgent: ANDROID_VR_UA,
          hl: 'en',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
      },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`InnerTube returned ${response.status}`);
  }

  const data = (await response.json()) as RawPlayerResponse;
  if (data.playabilityStatus?.status !== 'OK') {
    throw new Error(
      data.playabilityStatus?.reason || data.playabilityStatus?.status || 'Not playable',
    );
  }

  const streamingData = data.streamingData;
  if (!streamingData) {
    throw new Error('No streamingData');
  }

  const audioFormats = getAudioFormats(streamingData, false);
  if (audioFormats.length === 0) {
    const total = (streamingData.adaptiveFormats || []).length;
    const withUrl = (streamingData.adaptiveFormats || []).filter((format) => format.url).length;
    throw new Error(`No audio URLs (${total} formats, ${withUrl} with url)`);
  }

  audioFormats.sort(sortFormatsByBitrateDescending);
  const best = audioFormats[0];
  if (!best.url) {
    throw new Error('ANDROID_VR response missing direct URL');
  }

  const finalUrl = await maybeDecipherNParam(best.url, 'ANDROID_VR');

  console.log(
    '[YT-AUDIO] ANDROID_VR success, itag:',
    best.itag,
    'bitrate:',
    best.bitrate,
    'mime:',
    best.mimeType,
  );

  return {
    url: finalUrl,
    mimeType: best.mimeType || 'audio/mp4',
    contentLength: toContentLength(best.contentLength),
    headers: { 'User-Agent': CDN_UA },
  };
}
