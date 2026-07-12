import { ANDROID_UA, ANDROID_VERSION, CDN_UA } from '../constants';
import type { ResolvedAudioUrl } from '../types';
import {
  getAudioFormats,
  getIosCompatibleMuxedFormats,
  isIosCompatibleAudioMimeType,
  sortFormatsByBitrateDescending,
  toContentLength,
} from './format-helpers';
import { maybeDecipherCipherUrl, maybeDecipherNParam } from './player-decipher';
import { generateCpn, generateT } from './request-tokens';
import type { RawReelResponse } from './types';

export interface GetAudioUrlViaAndroidOptions {
  requireIosCompatibleFormat?: boolean;
}

async function fetchAndroidReelPlayerResponse(videoId: string): Promise<RawReelResponse> {
  const cpn = generateCpn();
  const t = generateT();
  const response = await fetch(
    `https://youtubei.googleapis.com/youtubei/v1/reel/reel_item_watch?prettyPrint=false&t=${t}&id=${videoId}&$fields=playerResponse`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': ANDROID_UA,
        'X-Goog-Api-Format-Version': '2',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: ANDROID_VERSION,
            clientScreen: 'WATCH',
            platform: 'MOBILE',
            osName: 'Android',
            osVersion: '16',
            androidSdkVersion: 36,
            hl: 'en',
            gl: 'US',
            utcOffsetMinutes: 0,
          },
          request: { internalExperimentFlags: [], useSsl: true },
          user: { lockedSafetyMode: false },
        },
        playerRequest: {
          videoId,
          cpn,
          contentCheckOk: true,
          racyCheckOk: true,
        },
        disablePlayerResponse: false,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`ANDROID reel endpoint returned ${response.status}`);
  }

  return response.json() as Promise<RawReelResponse>;
}

export async function getAudioUrlViaAndroid(
  videoId: string,
  options: GetAudioUrlViaAndroidOptions = {},
): Promise<ResolvedAudioUrl> {
  let best: ReturnType<typeof getAudioFormats>[number] | null = null;
  let selectedMuxedFallback = false;
  let lastError = 'ANDROID reel: no audio formats';

  for (let attempt = 0; attempt < 2 && !best; attempt += 1) {
    const data = await fetchAndroidReelPlayerResponse(videoId);
    const playerResponse = data.playerResponse ?? data;
    if (playerResponse.playabilityStatus?.status !== 'OK') {
      throw new Error(
        playerResponse.playabilityStatus?.reason ||
          playerResponse.playabilityStatus?.status ||
          'Not playable',
      );
    }

    const streamingData = playerResponse.streamingData;
    if (!streamingData) {
      throw new Error('No streamingData in playerResponse');
    }

    const audioFormats = getAudioFormats(streamingData, true);
    if (audioFormats.length === 0) {
      if (options.requireIosCompatibleFormat) {
        const muxedCandidates = getIosCompatibleMuxedFormats(streamingData, true);
        if (muxedCandidates.length > 0) {
          muxedCandidates.sort(sortFormatsByBitrateDescending);
          best = muxedCandidates[0];
          selectedMuxedFallback = true;
          continue;
        }
      }

      const total = (streamingData.adaptiveFormats || []).length;
      lastError = `No audio formats from reel endpoint (${total} formats total)`;
      continue;
    }

    const candidates = options.requireIosCompatibleFormat
      ? audioFormats.filter((format) => isIosCompatibleAudioMimeType(format.mimeType))
      : audioFormats;
    if (candidates.length > 0) {
      candidates.sort(sortFormatsByBitrateDescending);
      best = candidates[0];
      selectedMuxedFallback = false;
      continue;
    }

    if (options.requireIosCompatibleFormat) {
      const muxedCandidates = getIosCompatibleMuxedFormats(streamingData, true);
      if (muxedCandidates.length > 0) {
        muxedCandidates.sort(sortFormatsByBitrateDescending);
        best = muxedCandidates[0];
        selectedMuxedFallback = true;
        continue;
      }
    }

    lastError = options.requireIosCompatibleFormat
      ? 'ANDROID reel: no iOS-compatible audio or muxed formats'
      : 'ANDROID reel: no audio formats';
  }

  if (!best) {
    throw new Error(lastError);
  }

  let finalUrl = best.url;
  if (!finalUrl && (best.signatureCipher || best.cipher)) {
    finalUrl = await maybeDecipherCipherUrl(best.signatureCipher, best.cipher);
    if (!finalUrl) {
      throw new Error('ANDROID reel: cipher format but player unavailable');
    }
  }

  if (!finalUrl) {
    throw new Error('ANDROID reel: missing final URL');
  }

  finalUrl = await maybeDecipherNParam(finalUrl, 'ANDROID');

  console.log(
    selectedMuxedFallback
      ? '[YT-AUDIO] ANDROID reel muxed fallback success, itag:'
      : '[YT-AUDIO] ANDROID reel success, itag:',
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
