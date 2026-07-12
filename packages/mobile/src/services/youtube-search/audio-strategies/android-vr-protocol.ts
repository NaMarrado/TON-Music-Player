import type { RawAdaptiveFormat, RawStreamingData } from './types';

// Versions newer than 1.65 currently return SABR-only responses for this client.
export const ANDROID_VR_CLIENT = Object.freeze({
  apiBaseUrl: 'https://youtubei.googleapis.com/youtubei/v1',
  id: '28',
  name: 'ANDROID_VR',
  version: '1.65.10',
  userAgent:
    'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
});

export type AndroidVrContext = {
  client: {
    androidSdkVersion: number;
    clientName: typeof ANDROID_VR_CLIENT.name;
    clientVersion: typeof ANDROID_VR_CLIENT.version;
    deviceMake: string;
    deviceModel: string;
    gl: string;
    hl: string;
    osName: string;
    osVersion: string;
    platform: 'MOBILE';
    userAgent: string;
    utcOffsetMinutes: number;
    visitorData?: string;
  };
  request: {
    internalExperimentFlags: never[];
    useSsl: true;
  };
  user: {
    lockedSafetyMode: false;
  };
};

export function createAndroidVrContext(visitorData?: string): AndroidVrContext {
  return {
    client: {
      androidSdkVersion: 32,
      clientName: ANDROID_VR_CLIENT.name,
      clientVersion: ANDROID_VR_CLIENT.version,
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      gl: 'US',
      hl: 'en',
      osName: 'Android',
      osVersion: '12L',
      platform: 'MOBILE',
      userAgent: ANDROID_VR_CLIENT.userAgent,
      utcOffsetMinutes: 0,
      ...(visitorData ? { visitorData } : {}),
    },
    request: {
      internalExperimentFlags: [],
      useSsl: true,
    },
    user: {
      lockedSafetyMode: false,
    },
  };
}

export function createAndroidVrHeaders(visitorData?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': ANDROID_VR_CLIENT.userAgent,
    'X-Goog-Api-Format-Version': '2',
    'X-YouTube-Client-Name': ANDROID_VR_CLIENT.id,
    'X-YouTube-Client-Version': ANDROID_VR_CLIENT.version,
    ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}),
  };
}

export function selectBestAndroidVrAudioFormat(
  streamingData: RawStreamingData,
): RawAdaptiveFormat | null {
  const candidates = (streamingData.adaptiveFormats ?? []).filter((format) => (
    format.mimeType?.toLowerCase().startsWith('audio/')
    && Boolean(format.url || format.signatureCipher || format.cipher)
  ));

  candidates.sort((left, right) => (right.bitrate ?? 0) - (left.bitrate ?? 0));
  return candidates[0] ?? null;
}
