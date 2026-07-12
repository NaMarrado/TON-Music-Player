import { IOS_UA, IOS_VERSION } from '../constants';
import type { ResolvedAudioUrl } from '../types';
import {
  getAudioFormats,
  isAacM4aAudioMimeType,
  sortFormatsByBitrateDescending,
  toContentLength,
} from './format-helpers';
import { maybeDecipherCipherUrl, maybeDecipherNParam } from './player-decipher';
import type { RawPlayerResponse } from './types';

export async function getAudioUrlViaIos(
  videoId: string,
): Promise<ResolvedAudioUrl> {
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
        },
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
  const best = audioFormats.find((format) => isAacM4aAudioMimeType(format.mimeType));
  if (!best) {
    throw new Error('IOS player: no compatible AAC/M4A audio format');
  }

  let finalUrl = best.url;
  if (!finalUrl && (best.signatureCipher || best.cipher)) {
    finalUrl = await maybeDecipherCipherUrl(
      best.signatureCipher,
      best.cipher,
    );
    if (!finalUrl) {
      throw new Error('IOS player: cipher format but player unavailable');
    }
  }

  if (!finalUrl) {
    throw new Error('IOS player: missing final URL');
  }

  finalUrl = await maybeDecipherNParam(finalUrl, 'IOS');

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
    headers: { 'User-Agent': IOS_UA },
  };
}
