import { getPoToken, isPoTokenReady } from '../../po-token-service';
import { CDN_UA, IOS_UA, IOS_VERSION } from '../constants';
import { getErrorMessage } from '../errors';
import type { ResolvedAudioUrl } from '../types';
import {
  getAudioFormats,
  isIosCompatibleAudioMimeType,
  sortFormatsByBitrateDescending,
  toContentLength,
} from './format-helpers';
import { maybeDecipherCipherUrl, maybeDecipherNParam } from './player-decipher';
import type { RawPlayerResponse } from './types';

export interface GetAudioUrlViaIosOptions {
  requirePoToken?: boolean;
}

function ensureGvsPoToken(url: string, poToken: string | undefined): string {
  if (!poToken) {
    return url;
  }

  const parsedUrl = new URL(url);
  if (!parsedUrl.searchParams.has('pot')) {
    parsedUrl.searchParams.set('pot', poToken);
  }
  return parsedUrl.toString();
}

export async function getAudioUrlViaIos(
  videoId: string,
  options: GetAudioUrlViaIosOptions = {},
): Promise<ResolvedAudioUrl> {
  let poToken: string | undefined;
  let visitorData: string | undefined;

  if (isPoTokenReady()) {
    try {
      const token = await getPoToken({ binding: 'video', videoId });
      poToken = token.poToken;
      visitorData = token.visitorData;
    } catch (error) {
      console.warn('[YT-AUDIO] IOS po_token unavailable:', getErrorMessage(error));
    }
  }

  if (options.requirePoToken && !poToken) {
    throw new Error('IOS player: video-bound po_token unavailable');
  }

  const playerOptions = poToken
    ? {
        cacheKey: `ios:${videoId}:${poToken}`,
        poToken,
        visitorData,
      }
    : {};

  const response = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': IOS_UA,
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': IOS_VERSION,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: IOS_VERSION,
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.3.0.22D64',
          hl: 'en',
          gl: 'US',
          ...(visitorData ? { visitorData } : {}),
        },
        ...(poToken ? { serviceIntegrityDimensions: { poToken } } : {}),
      },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`IOS player endpoint returned ${response.status}`);
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

  const audioFormats = getAudioFormats(streamingData, true);
  if (audioFormats.length === 0) {
    const total = (streamingData.adaptiveFormats || []).length;
    throw new Error(`No audio formats from IOS player endpoint (${total} formats total)`);
  }

  audioFormats.sort(sortFormatsByBitrateDescending);
  const best = audioFormats.find((format) => isIosCompatibleAudioMimeType(format.mimeType))
    ?? audioFormats[0];

  let finalUrl = best.url;
  if (!finalUrl && (best.signatureCipher || best.cipher)) {
    finalUrl = await maybeDecipherCipherUrl(
      best.signatureCipher,
      best.cipher,
      playerOptions,
    );
    if (!finalUrl) {
      throw new Error('IOS player: cipher format but player unavailable');
    }
  }

  if (!finalUrl) {
    throw new Error('IOS player: missing final URL');
  }

  finalUrl = await maybeDecipherNParam(finalUrl, 'IOS', playerOptions);
  finalUrl = ensureGvsPoToken(finalUrl, poToken);

  if (options.requirePoToken && !new URL(finalUrl).searchParams.has('pot')) {
    throw new Error('IOS player: missing GVS PO token');
  }

  console.log(
    '[YT-AUDIO] IOS player success, itag:',
    best.itag,
    'bitrate:',
    best.bitrate,
    'mime:',
    best.mimeType,
  );

  const contentLength = toContentLength(best.contentLength);

  return {
    url: finalUrl,
    mimeType: best.mimeType || 'audio/mp4',
    contentLength,
    headers: { 'User-Agent': poToken ? IOS_UA : CDN_UA },
  };
}
